import { beforeEach, describe, expect, it } from 'vitest';
import { sentMessages } from '../../src/common/mail/mailer';
import { hashToken } from '../../src/common/auth/tokens';
import { api, bearer, login } from '../helpers/app';
import { createUser, DEFAULT_PASSWORD, prisma, resetDatabase } from '../helpers/db';

const LOGIN = '/api/v1/auth/login';
const SENSITIVE_KEYS = ['passwordHash', 'tokenVersion', 'failedLoginAttempts', 'lockedUntil'];

function expectNoSensitiveFields(obj: unknown) {
  const json = JSON.stringify(obj);
  for (const key of SENSITIVE_KEYS) expect(json).not.toContain(`"${key}"`);
}

beforeEach(async () => {
  await resetDatabase();
  sentMessages.length = 0;
});

describe('POST /auth/login', () => {
  it('returns tokens and the public user; email is case-insensitive', async () => {
    const user = await createUser({ role: 'MANAGER', email: 'jane@test.local' });
    const res = await api().post(LOGIN).send({ email: '  JANE@Test.Local ', password: DEFAULT_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessTokenExpiresIn: 900,
      user: { id: user.id, email: 'jane@test.local', role: { name: 'MANAGER' } },
    });
    expectNoSensitiveFields(res.body);

    const stored = await prisma.refreshToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).toBe(hashToken(res.body.data.refreshToken)); // only the hash is stored
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'auth.login', actorId: user.id } })).toBe(1);
  });

  it('responds identically for unknown email and wrong password', async () => {
    await createUser({ email: 'known@test.local' });
    const wrong = await api().post(LOGIN).send({ email: 'known@test.local', password: 'Wrong12345' });
    const unknown = await api().post(LOGIN).send({ email: 'nobody@test.local', password: 'Wrong12345' });

    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect({ ...wrong.body.error, requestId: null }).toEqual({ ...unknown.body.error, requestId: null });
  });

  it('locks the account after 5 failures; even the correct password is rejected while locked', async () => {
    const user = await createUser({ email: 'lock@test.local' });
    for (let i = 0; i < 5; i++) {
      await api().post(LOGIN).send({ email: user.email, password: 'Wrong12345' }).expect(401);
    }
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    const res = await api().post(LOGIN).send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await prisma.auditLog.count({ where: { action: 'auth.account_locked', entityId: user.id } })).toBe(1);

    // Lock expires → login works and the counter resets.
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    await api().post(LOGIN).send({ email: user.email, password: DEFAULT_PASSWORD }).expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lockedUntil).toBeNull();
  });

  it('rejects deactivated users with ACCOUNT_INACTIVE (after a correct password)', async () => {
    const user = await createUser({ isActive: false });
    const res = await api().post(LOGIN).send({ email: user.email, password: DEFAULT_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('validates input', async () => {
    const res = await api().post(LOGIN).send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.map((d: { field: string }) => d.field).sort()).toEqual(['email', 'password']);
  });
});

describe('refresh token rotation', () => {
  it('rotates: new pair issued, old token revoked and linked to its successor', async () => {
    const user = await createUser();
    const s = await login(user.email);

    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).not.toBe(s.refreshToken);

    const old = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(s.refreshToken) } });
    const next = await prisma.refreshToken.findUniqueOrThrow({ where: { tokenHash: hashToken(res.body.data.refreshToken) } });
    expect(old.revokedReason).toBe('rotated');
    expect(old.replacedByTokenId).toBe(next.id);
    expect(next.familyId).toBe(old.familyId);

    await api().get('/api/v1/auth/me').set(bearer(res.body.data)).expect(200);
  });

  it('allows reuse of a just-rotated token within the grace window (parallel requests)', async () => {
    const s = await login((await createUser()).email);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    const again = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(again.status).toBe(200);
  });

  it('detects reuse after the grace window and revokes the whole family', async () => {
    const user = await createUser();
    const s = await login(user.email);
    const rotated = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(200);
    // Simulate the old token being replayed later (e.g. stolen).
    await prisma.refreshToken.update({
      where: { tokenHash: hashToken(s.refreshToken) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(replay.status).toBe(401);
    // The legitimate successor is now revoked too.
    await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated.body.data.refreshToken }).expect(401);
    expect(await prisma.refreshToken.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'auth.token_reuse_detected' } })).toBe(1);
  });

  it('rejects unknown and expired tokens', async () => {
    await api().post('/api/v1/auth/refresh').send({ refreshToken: 'x'.repeat(43) }).expect(401);
    const s = await login((await createUser()).email);
    await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('refuses to refresh for a deactivated user', async () => {
    const user = await createUser();
    const s = await login(user.email);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const res = await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('logout', () => {
  it('logout revokes the session family and is idempotent', async () => {
    const s = await login((await createUser()).email);
    await api().post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
    await api().post('/api/v1/auth/logout').send({ refreshToken: s.refreshToken }).expect(204);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
  });

  it('logout-all revokes every session and invalidates outstanding access tokens', async () => {
    const user = await createUser();
    const a = await login(user.email);
    const b = await login(user.email);
    await api().post('/api/v1/auth/logout-all').set(bearer(a)).expect(204);

    await api().get('/api/v1/auth/me').set(bearer(b)).expect(401);
    await api().post('/api/v1/auth/refresh').send({ refreshToken: b.refreshToken }).expect(401);
  });
});

describe('profile', () => {
  it('GET /auth/me returns the user with effective permissions and no secrets', async () => {
    const user = await createUser({ role: 'STAFF' });
    const s = await login(user.email);
    const res = await api().get('/api/v1/auth/me').set(bearer(s)).expect(200);
    expect(res.body.data).toMatchObject({ id: user.id, role: { name: 'STAFF' } });
    expect(res.body.data.permissions).toContain('orders.confirm');
    expect(res.body.data.permissions).not.toContain('orders.cancel');
    expectNoSensitiveFields(res.body);
  });

  it('PATCH /auth/me updates name and phone only', async () => {
    const s = await login((await createUser({ role: 'STAFF' })).email);
    const res = await api()
      .patch('/api/v1/auth/me')
      .set(bearer(s))
      .send({ name: 'Renamed', phone: '+880 1711-000000', email: 'hacker@test.local', roleId: 'x' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Renamed', phone: '+880 1711-000000', email: s.email, role: { name: 'STAFF' } });
    await api().patch('/api/v1/auth/me').set(bearer(s)).send({}).expect(422);
  });

  it('change password: wrong current password rejected; success revokes old sessions and returns new tokens', async () => {
    const user = await createUser();
    const s = await login(user.email);
    const other = await login(user.email);

    const bad = await api()
      .post('/api/v1/auth/change-password')
      .set(bearer(s))
      .send({ currentPassword: 'Nope12345', newPassword: 'NewPassword9' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].field).toBe('currentPassword');

    const ok = await api()
      .post('/api/v1/auth/change-password')
      .set(bearer(s))
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'NewPassword9' })
      .expect(200);

    await api().get('/api/v1/auth/me').set(bearer(s)).expect(401); // old access token invalid
    await api().post('/api/v1/auth/refresh').send({ refreshToken: other.refreshToken }).expect(401);
    await api().get('/api/v1/auth/me').set(bearer(ok.body.data)).expect(200);
    await login(user.email, 'NewPassword9');
  });
});

describe('password reset', () => {
  const requestReset = (email: string) => api().post('/api/v1/auth/forgot-password').send({ email });
  const tokenFromMail = () => /token=([A-Za-z0-9_-]+)/.exec(sentMessages.at(-1)!.text)![1]!;

  it('same response for unknown emails; no email sent', async () => {
    const res = await requestReset('ghost@test.local');
    expect(res.status).toBe(202);
    expect(sentMessages).toHaveLength(0);
  });

  it('full flow: email link resets the password once, revokes sessions, clears lockout', async () => {
    const user = await createUser({ email: 'reset@test.local' });
    const s = await login(user.email);
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 600_000) } });

    await requestReset('RESET@test.local').expect(202);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0]!.to).toBe('reset@test.local');
    const token = tokenFromMail();
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: hashToken(token) } })).toBe(1);

    await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'BrandNew123' }).expect(204);
    await api().post('/api/v1/auth/reset-password').send({ token, newPassword: 'Another123' }).expect(400);

    await api().post('/api/v1/auth/refresh').send({ refreshToken: s.refreshToken }).expect(401);
    await login(user.email, 'BrandNew123');
  });

  it('only the newest link is valid and expired links are rejected', async () => {
    const user = await createUser();
    await requestReset(user.email);
    const first = tokenFromMail();
    await requestReset(user.email);
    const second = tokenFromMail();

    await api().post('/api/v1/auth/reset-password').send({ token: first, newPassword: 'BrandNew123' }).expect(400);
    await prisma.passwordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api().post('/api/v1/auth/reset-password').send({ token: second, newPassword: 'BrandNew123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('enforces the password policy', async () => {
    const res = await api().post('/api/v1/auth/reset-password').send({ token: 'x'.repeat(43), newPassword: 'short' });
    expect(res.status).toBe(422);
  });
});

describe('self-registration', () => {
  const body = { name: 'New Person', email: 'new@test.local', password: 'Welcome123' };

  it('is rejected while disabled (default)', async () => {
    const res = await api().post('/api/v1/auth/register').send(body);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REGISTRATION_DISABLED');
  });

  it('when enabled, creates an inactive STAFF account that cannot log in until activated', async () => {
    await prisma.businessSetting.update({ where: { id: 1 }, data: { allowSelfRegistration: true } });
    const res = await api().post('/api/v1/auth/register').send(body).expect(201);
    expect(res.body.data.user).toMatchObject({ email: 'new@test.local', isActive: false, role: { name: 'STAFF' } });
    expectNoSensitiveFields(res.body);

    await api().post(LOGIN).send({ email: body.email, password: body.password }).expect(403);
    const dup = await api().post('/api/v1/auth/register').send(body);
    expect(dup.status).toBe(409);
  });
});
