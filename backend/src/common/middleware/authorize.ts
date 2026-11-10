import type { RequestHandler } from 'express';
import type { AuthContext } from '../types/express';
import type { Permission } from '../auth/permissions';
import { forbidden, unauthenticated } from '../errors/app-error';

export function hasPermission(auth: AuthContext | undefined, permission: Permission): boolean {
  return !!auth && (auth.isAdmin || auth.permissions.has(permission));
}

export const PERMISSIONS_METADATA = Symbol('requiredPermissions');

export type PermissionProtectedHandler = RequestHandler & {
  [PERMISSIONS_METADATA]?: Permission[];
};

/** Requires ALL listed permissions. Must run after `authenticate`. */
export function authorize(...required: Permission[]): PermissionProtectedHandler {
  const mw: PermissionProtectedHandler = (req, _res, next) => {
    if (!req.auth) throw unauthenticated();
    const missing = required.filter((p) => !hasPermission(req.auth, p));
    if (missing.length) throw forbidden();
    next();
  };
  mw[PERMISSIONS_METADATA] = required;
  return mw;
}

/** Requires AT LEAST ONE of the listed permissions. */
export function authorizeAny(...anyOf: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw unauthenticated();
    if (!anyOf.some((p) => hasPermission(req.auth, p))) throw forbidden();
    next();
  };
}
