import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { prisma, type Db } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { ALL_PERMISSIONS, SystemRole, isPermission, type Permission } from '../../common/auth/permissions';
import { getDummyHash, hashPassword, verifyPassword } from '../../common/auth/password';
import { generateOpaqueToken, hashToken, signAccessToken } from '../../common/auth/tokens';
import { withTransaction } from '../../common/db/transaction';
import { isUniqueViolation } from '../../common/errors/db-errors';
import { AppError, ErrorCode, conflict, forbidden, notFound, unauthenticated } from '../../common/errors/app-error';
import { sendMail } from '../../common/mail/mailer';
import { publicUserSelect, type PublicUser } from '../users/users.presenter';
import type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schemas';

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

export interface SessionResult extends TokenPair {
  user: PublicUser;
}

const invalidCredentials = () =>
  unauthenticated('Invalid email or password', ErrorCode.INVALID_CREDENTIALS);
const invalidRefreshToken = () => unauthenticated('Invalid or expired refresh token', ErrorCode.INVALID_TOKEN);

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

async function issueTokens(
  db: Db,
  user: { id: string; tokenVersion: number },
  ctx: RequestContext,
  familyId: string = randomUUID(),
): Promise<TokenPair & { refreshTokenId: string }> {
  const refreshToken = generateOpaqueToken();
  const refreshTokenExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const row = await db.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      expiresAt: refreshTokenExpiresAt,
      createdByIp: ctx.ipAddress,
      userAgent: ctx.userAgent,
    },
    select: { id: true },
  });
  const access = signAccessToken(user.id, user.tokenVersion);
  return {
    accessToken: access.token,
    accessTokenExpiresIn: access.expiresIn,
    refreshToken,
    refreshTokenExpiresAt,
    refreshTokenId: row.id,
  };
}

function revokeFamily(db: Db, familyId: string, reason: string) {
  return db.refreshToken.updateMany({
    where: { familyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

/** Revokes every session of a user and invalidates all outstanding access tokens. */
export async function revokeAllSessions(db: Db, userId: string, reason: string): Promise<void> {
  await db.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}

// ---------------------------------------------------------------------------
// Login / refresh / logout
// ---------------------------------------------------------------------------

export async function login(input: LoginInput, ctx: RequestContext): Promise<SessionResult> {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, passwordHash: true, isActive: true, tokenVersion: true, lockedUntil: true },
  });

  if (!user) {
    await verifyPassword(input.password, await getDummyHash()); // equalise timing
    await recordAudit(prisma, { ...ctx, actorId: null }, {
      action: 'auth.login_failed',
      entityType: 'user',
      metadata: { email: input.email, reason: 'unknown_email' },
    });
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await verifyPassword(input.password, await getDummyHash());
    await recordAudit(prisma, { ...ctx, actorId: null }, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'locked' },
    });
    throw invalidCredentials(); // indistinguishable from bad credentials (FR-AUTH-09)
  }

  if (!(await verifyPassword(input.password, user.passwordHash))) {
    await registerFailedAttempt(user.id, ctx);
    throw invalidCredentials();
  }

  if (!user.isActive) {
    await recordAudit(prisma, { ...ctx, actorId: null }, {
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { reason: 'inactive' },
    });
    throw forbidden('Account is deactivated', ErrorCode.ACCOUNT_INACTIVE);
  }

  return withTransaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
      select: { ...publicUserSelect, tokenVersion: true },
    });
    const tokens = await issueTokens(tx, updated, ctx);
    await recordAudit(tx, { ...ctx, actorId: user.id }, { action: 'auth.login', entityType: 'user', entityId: user.id });
    const { tokenVersion: _tv, ...publicUser } = updated;
    const { refreshTokenId: _id, ...pair } = tokens;
    return { ...pair, user: publicUser };
  });
}

async function registerFailedAttempt(userId: string, ctx: RequestContext): Promise<void> {
  // Atomic increment: concurrent failures are all counted.
  const { failedLoginAttempts } = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true },
  });
  const locked = failedLoginAttempts >= env.LOGIN_MAX_ATTEMPTS;
  if (locked) {
    await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000) },
    });
  }
  await recordAudit(prisma, { ...ctx, actorId: null }, {
    action: locked ? 'auth.account_locked' : 'auth.login_failed',
    entityType: 'user',
    entityId: userId,
    metadata: { reason: 'wrong_password', attempts: failedLoginAttempts },
  });
}

/**
 * Rotates a refresh token. Presenting an already-rotated token is treated as theft and revokes
 * the whole family, except within a short grace window (parallel requests refreshing at once)
 * while the family is still alive (BR-AUTH-02).
 */
export async function refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: {
      id: true,
      familyId: true,
      expiresAt: true,
      revokedAt: true,
      revokedReason: true,
      user: { select: { id: true, isActive: true, tokenVersion: true } },
    },
  });
  if (!token) throw invalidRefreshToken();

  if (token.revokedAt) {
    const withinGrace =
      token.revokedReason === 'rotated' &&
      Date.now() - token.revokedAt.getTime() <= env.REFRESH_TOKEN_REUSE_GRACE_SECONDS * 1000;
    const familyAlive =
      withinGrace &&
      (await prisma.refreshToken.count({ where: { familyId: token.familyId, revokedAt: null } })) > 0;
    if (!familyAlive) {
      if (token.revokedReason === 'rotated') {
        await revokeFamily(prisma, token.familyId, 'reuse_detected');
        await recordAudit(prisma, { ...ctx, actorId: token.user.id }, {
          action: 'auth.token_reuse_detected',
          entityType: 'user',
          entityId: token.user.id,
          metadata: { familyId: token.familyId },
        });
      }
      throw invalidRefreshToken();
    }
  }

  if (token.expiresAt <= new Date()) throw invalidRefreshToken();

  if (!token.user.isActive) {
    await revokeFamily(prisma, token.familyId, 'user_inactive');
    throw forbidden('Account is deactivated', ErrorCode.ACCOUNT_INACTIVE);
  }

  return withTransaction(async (tx) => {
    const next = await issueTokens(tx, token.user, ctx, token.familyId);
    if (!token.revokedAt) {
      // Conditional: if another request rotated it first, keep both successors (grace semantics).
      await tx.refreshToken.updateMany({
        where: { id: token.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', replacedByTokenId: next.refreshTokenId },
      });
    }
    const { refreshTokenId: _id, ...pair } = next;
    return pair;
  });
}

export async function logout(refreshToken: string, ctx: RequestContext): Promise<void> {
  const token = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    select: { familyId: true, userId: true },
  });
  if (!token) return; // idempotent
  await revokeFamily(prisma, token.familyId, 'logout');
  await recordAudit(prisma, { ...ctx, actorId: token.userId }, {
    action: 'auth.logout',
    entityType: 'user',
    entityId: token.userId,
  });
}

export async function logoutAll(userId: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (tx) => {
    await revokeAllSessions(tx, userId, 'logout_all');
    await recordAudit(tx, ctx, { action: 'auth.logout_all', entityType: 'user', entityId: userId });
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface CurrentUser extends PublicUser {
  permissions: Permission[];
}

export async function getCurrentUser(userId: string): Promise<CurrentUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...publicUserSelect,
      role: { select: { id: true, name: true, isSystem: true, permissions: { select: { permissionKey: true } } } },
    },
  });
  if (!user) throw notFound('User');
  const { role, ...rest } = user;
  const permissions =
    role.isSystem && role.name === SystemRole.ADMIN
      ? [...ALL_PERMISSIONS]
      : role.permissions.map((p) => p.permissionKey).filter(isPermission).sort();
  return { ...rest, role: { id: role.id, name: role.name }, permissions };
}

export async function updateProfile(userId: string, input: UpdateProfileInput, ctx: RequestContext): Promise<PublicUser> {
  return withTransaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, phone: true } });
    const user = await tx.user.update({
      where: { id: userId },
      data: { name: input.name, phone: input.phone },
      select: publicUserSelect,
    });
    await recordAudit(tx, ctx, {
      action: 'auth.profile_updated',
      entityType: 'user',
      entityId: userId,
      metadata: { before, after: { name: user.name, phone: user.phone } },
    });
    return user;
  });
}

/** Changes the password, revokes every session and returns a fresh session for the caller. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ctx: RequestContext,
): Promise<TokenPair> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new AppError(422, ErrorCode.VALIDATION_ERROR, 'Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }
  const passwordHash = await hashPassword(newPassword);
  return withTransaction(async (tx) => {
    await revokeAllSessions(tx, userId, 'password_changed');
    const updated = await tx.user.update({
      where: { id: userId },
      data: { passwordHash, passwordChangedAt: new Date() },
      select: { id: true, tokenVersion: true },
    });
    await recordAudit(tx, ctx, { action: 'auth.password_changed', entityType: 'user', entityId: userId });
    const { refreshTokenId: _id, ...pair } = await issueTokens(tx, updated, ctx);
    return pair;
  });
}

// ---------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------

/**
 * Always resolves the same way regardless of whether the email exists (no account enumeration).
 * Email delivery is not awaited so response timing does not reveal the outcome.
 */
export async function requestPasswordReset(email: string, ctx: RequestContext): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, isActive: true } });
  if (!user || !user.isActive) return;

  const token = generateOpaqueToken();
  await withTransaction(async (tx) => {
    // Only the newest link is valid.
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
        requestedIp: ctx.ipAddress,
      },
    });
    await recordAudit(tx, { ...ctx, actorId: null }, {
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: user.id,
    });
  });

  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  void sendMail({
    to: email,
    subject: 'Reset your password',
    text:
      `Hello ${user.name},\n\nUse the link below to set a new password. It expires in ` +
      `${env.PASSWORD_RESET_TTL_MINUTES} minutes and can be used once.\n\n${link}\n\n` +
      `If you did not request this, you can ignore this email.`,
  }).catch((err: unknown) => logger.error({ err }, 'failed to send password reset email'));
}

export async function resetPassword(token: string, newPassword: string, ctx: RequestContext): Promise<void> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { isActive: true } } },
  });
  const invalid = () =>
    new AppError(400, ErrorCode.INVALID_TOKEN, 'This password reset link is invalid or has expired');
  if (!row || row.usedAt || row.expiresAt <= new Date() || !row.user.isActive) throw invalid();

  const passwordHash = await hashPassword(newPassword);
  await withTransaction(async (tx) => {
    // Single use even under concurrent submissions.
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) throw invalid();
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, lockedUntil: null },
    });
    await revokeAllSessions(tx, row.userId, 'password_reset');
    await recordAudit(tx, { ...ctx, actorId: null }, {
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: row.userId,
    });
  });
}

// ---------------------------------------------------------------------------
// Self-registration (FR-AUTH-04)
// ---------------------------------------------------------------------------

export async function register(input: RegisterInput, ctx: RequestContext): Promise<PublicUser> {
  const settings = await prisma.businessSetting.findUnique({ where: { id: 1 }, select: { allowSelfRegistration: true } });
  if (!settings?.allowSelfRegistration) {
    throw forbidden('Self-registration is disabled; ask an administrator for an account', ErrorCode.REGISTRATION_DISABLED);
  }
  const staffRole = await prisma.role.findUnique({ where: { name: SystemRole.STAFF }, select: { id: true } });
  if (!staffRole) throw new Error('STAFF role missing — run the database seed');

  const passwordHash = await hashPassword(input.password);
  try {
    return await withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          roleId: staffRole.id,
          isActive: false, // pending administrator approval
        },
        select: publicUserSelect,
      });
      await recordAudit(tx, { ...ctx, actorId: null }, {
        action: 'auth.registered',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email, role: SystemRole.STAFF },
      });
      return user;
    });
  } catch (err) {
    if (isUniqueViolation(err, 'email')) throw conflict('An account with this email already exists', ErrorCode.DUPLICATE);
    throw err;
  }
}
