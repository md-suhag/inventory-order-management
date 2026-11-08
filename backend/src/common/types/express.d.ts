import type { Permission } from '../auth/permissions';

export interface AuthContext {
  userId: string;
  roleId: string;
  roleName: string;
  /** System ADMIN role: implicitly holds every permission, including ones added after seeding. */
  isAdmin: boolean;
  permissions: ReadonlySet<Permission>;
}

declare global {
  namespace Express {
    interface Request {
      /** Correlation id (X-Request-Id), set by the requestId middleware. */
      id: string;
      /** Present on routes behind `authenticate`. */
      auth?: AuthContext;
      /** Present on routes behind `requireIdempotencyKey`. */
      idempotencyKey?: string;
    }
  }
}

export {};
