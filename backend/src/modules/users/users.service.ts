import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { hashPassword } from '../../common/auth/password';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { isUniqueViolation } from '../../common/errors/db-errors';
import { ErrorCode, businessRule, conflict, forbidden, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import type { AuthContext } from '../../common/types/express';
import { revokeAllSessions } from '../auth/auth.service';
import { assertAnotherActiveAdmin, isAdminRole, lockAdminGuard } from './admin-guard';
import { publicUserSelect, type PublicUser } from './users.presenter';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput, UserSortField } from './users.schemas';

type Actor = Pick<AuthContext, 'userId' | 'isAdmin'>;

/** Prevents privilege escalation by holders of `users.manage` on a custom role (BR-USER-06). */
const onlyAdminsManageAdmins = () => forbidden('Only an administrator can manage administrator accounts');

export async function listUsers(query: ListUsersQuery): Promise<Paginated<PublicUser>> {
  const args = buildListArgs<UserSortField, Prisma.UserWhereInput, Prisma.UserOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'email'],
      sortFields: { name: 'name', email: 'email', createdAt: 'createdAt', lastLoginAt: 'lastLoginAt' },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    [query.roleId ? { roleId: query.roleId } : undefined, query.isActive !== undefined && { isActive: query.isActive }],
  );
  return paginate(
    query,
    () => prisma.user.findMany({ ...args, select: publicUserSelect }),
    () => prisma.user.count({ where: args.where }),
  );
}

export async function getUser(id: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  if (!user) throw notFound('User');
  return user;
}

async function findRole(db: Db, roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true, name: true, isSystem: true } });
  if (!role) throw invalidReference('roleId', 'Role does not exist');
  return role;
}

export async function createUser(input: CreateUserInput, actor: Actor, ctx: RequestContext): Promise<PublicUser> {
  const role = await findRole(prisma, input.roleId);
  if (isAdminRole(role) && !actor.isAdmin) throw onlyAdminsManageAdmins();

  const passwordHash = await hashPassword(input.password);
  try {
    return await withTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          passwordHash,
          roleId: role.id,
          createdById: actor.userId,
        },
        select: publicUserSelect,
      });
      await recordAudit(tx, ctx, {
        action: 'user.created',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email, role: role.name },
      });
      return user;
    });
  } catch (err) {
    if (isUniqueViolation(err, 'email')) throw conflict('An account with this email already exists', ErrorCode.DUPLICATE);
    throw err;
  }
}

async function loadTarget(tx: Tx, id: string, actor: Actor) {
  const target = await tx.user.findUnique({
    where: { id },
    select: { id: true, name: true, phone: true, isActive: true, role: { select: { id: true, name: true, isSystem: true } } },
  });
  if (!target) throw notFound('User');
  if (isAdminRole(target.role) && !actor.isAdmin) throw onlyAdminsManageAdmins();
  return target;
}

/**
 * Updates name/phone/role. A role change is never allowed on yourself (BR-USER-03), never removes
 * the last active admin (BR-USER-02) and revokes the user's sessions (BR-USER-04).
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: Actor,
  ctx: RequestContext,
): Promise<PublicUser> {
  return withTransaction(async (tx) => {
    if (input.roleId !== undefined) await lockAdminGuard(tx);
    const target = await loadTarget(tx, id, actor);

    const roleChanged = input.roleId !== undefined && input.roleId !== target.role.id;
    let newRoleName: string | undefined;
    if (roleChanged) {
      if (id === actor.userId) throw businessRule('You cannot change your own role');
      const newRole = await findRole(tx, input.roleId!);
      if (isAdminRole(newRole) && !actor.isAdmin) throw onlyAdminsManageAdmins();
      if (isAdminRole(target.role) && target.isActive) await assertAnotherActiveAdmin(tx, id);
      newRoleName = newRole.name;
    }

    await tx.user.update({
      where: { id },
      data: { name: input.name, phone: input.phone, roleId: roleChanged ? input.roleId : undefined },
    });
    if (roleChanged) await revokeAllSessions(tx, id, 'role_changed');

    const changes = diffChanges(
      { name: target.name, phone: target.phone, role: target.role.name },
      { name: input.name, phone: input.phone, role: newRoleName },
    );
    if (Object.keys(changes).length) {
      await recordAudit(tx, ctx, {
        action: roleChanged ? 'user.role_changed' : 'user.updated',
        entityType: 'user',
        entityId: id,
        metadata: { changes } as Prisma.InputJsonValue,
      });
    }
    return tx.user.findUniqueOrThrow({ where: { id }, select: publicUserSelect });
  });
}

/**
 * Activates or deactivates a user; repeating the current state is a no-op. Deactivation is never
 * allowed on yourself (BR-USER-03) or the last active admin (BR-USER-02) and revokes sessions
 * (BR-USER-04). Activation also clears a login lockout.
 */
export async function setUserActive(
  id: string,
  active: boolean,
  actor: Actor,
  ctx: RequestContext,
): Promise<PublicUser> {
  return withTransaction(async (tx) => {
    if (!active) await lockAdminGuard(tx);
    const target = await loadTarget(tx, id, actor);
    if (!active && id === actor.userId) throw businessRule('You cannot deactivate your own account');

    if (target.isActive !== active) {
      if (active) {
        await tx.user.update({ where: { id }, data: { isActive: true, failedLoginAttempts: 0, lockedUntil: null } });
      } else {
        if (isAdminRole(target.role)) await assertAnotherActiveAdmin(tx, id);
        await tx.user.update({ where: { id }, data: { isActive: false } });
        await revokeAllSessions(tx, id, 'deactivated');
      }
      await recordAudit(tx, ctx, {
        action: active ? 'user.activated' : 'user.deactivated',
        entityType: 'user',
        entityId: id,
      });
    }
    return tx.user.findUniqueOrThrow({ where: { id }, select: publicUserSelect });
  });
}
