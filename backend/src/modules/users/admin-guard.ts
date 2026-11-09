import { SystemRole } from '../../common/auth/permissions';
import { businessRule } from '../../common/errors/app-error';
import type { Tx } from '../../common/db/transaction';

/** Arbitrary, app-wide constant key for the "last active admin" advisory lock (BR-USER-02). */
const ADMIN_GUARD_LOCK_KEY = 72_400_001;

export function isAdminRole(role: { name: string; isSystem: boolean }): boolean {
  return role.isSystem && role.name === SystemRole.ADMIN;
}

/**
 * Serialises every change that could remove an active administrator (deactivation, role change)
 * for the rest of the transaction. Take it BEFORE reading the target user so the check below
 * sees the committed result of any competing change.
 */
export async function lockAdminGuard(tx: Tx): Promise<void> {
  // $executeRaw: pg_advisory_xact_lock returns `void`, which $queryRaw cannot deserialise.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_GUARD_LOCK_KEY}::bigint)`;
}

/** Throws unless some active ADMIN other than `excludingUserId` exists. Call under `lockAdminGuard`. */
export async function assertAnotherActiveAdmin(tx: Tx, excludingUserId: string): Promise<void> {
  const others = await tx.user.count({
    where: { id: { not: excludingUserId }, isActive: true, role: { isSystem: true, name: SystemRole.ADMIN } },
  });
  if (others === 0) {
    throw businessRule('At least one active administrator must remain', [
      { field: 'userId', message: 'This is the last active administrator' },
    ]);
  }
}
