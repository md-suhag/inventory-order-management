import type { RequestHandler } from 'express';
import { prisma } from '../../config/prisma';
import { verifyAccessToken } from '../auth/tokens';
import { isPermission, SystemRole, type Permission } from '../auth/permissions';
import { ErrorCode, unauthenticated, forbidden } from '../errors/app-error';

/**
 * Verifies the bearer access token and loads the user's current status and permissions
 * (one indexed query), so deactivation, role changes and logout-all take effect immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header) : null;
  if (!match?.[1]) throw unauthenticated();

  const result = verifyAccessToken(match[1]);
  if (!result.ok) {
    throw result.reason === 'expired'
      ? unauthenticated('Access token expired', ErrorCode.TOKEN_EXPIRED)
      : unauthenticated('Invalid access token', ErrorCode.INVALID_TOKEN);
  }

  const user = await prisma.user.findUnique({
    where: { id: result.claims.sub },
    select: {
      id: true,
      isActive: true,
      tokenVersion: true,
      role: { select: { id: true, name: true, isSystem: true, permissions: { select: { permissionKey: true } } } },
    },
  });
  if (!user || user.tokenVersion !== result.claims.tv) {
    throw unauthenticated('Session is no longer valid', ErrorCode.INVALID_TOKEN);
  }
  if (!user.isActive) throw forbidden('Account is deactivated', ErrorCode.ACCOUNT_INACTIVE);

  const permissions = new Set<Permission>(user.role.permissions.map((p) => p.permissionKey).filter(isPermission));
  req.auth = {
    userId: user.id,
    roleId: user.role.id,
    roleName: user.role.name,
    isAdmin: user.role.isSystem && user.role.name === SystemRole.ADMIN,
    permissions,
  };
  next();
};
