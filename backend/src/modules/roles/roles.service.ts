import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { ALL_PERMISSIONS, type Permission } from '../../common/auth/permissions';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { isUniqueViolation } from '../../common/errors/db-errors';
import { ErrorCode, businessRule, conflict, forbidden, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import type { AuthContext } from '../../common/types/express';
import { isAdminRole } from '../users/admin-guard';
import type { CreateRoleInput, ListRolesQuery, RoleSortField, UpdateRoleInput } from './roles.schemas';

type Actor = Pick<AuthContext, 'roleId' | 'isAdmin' | 'permissions'>;

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permissionKey: true } },
  _count: { select: { users: true } },
} satisfies Prisma.RoleSelect;

type RoleRow = Prisma.RoleGetPayload<{ select: typeof roleSelect }>;

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
}

function present(row: RoleRow): RoleView {
  const { permissions, _count, ...rest } = row;
  return {
    ...rest,
    // The system ADMIN role implicitly holds every permission, including ones added later.
    permissions: isAdminRole(row) ? [...ALL_PERMISSIONS].sort() : permissions.map((p) => p.permissionKey).sort(),
    userCount: _count.users,
  };
}

export async function listRoles(query: ListRolesQuery): Promise<Paginated<RoleView>> {
  const args = buildListArgs<RoleSortField, Prisma.RoleWhereInput, Prisma.RoleOrderByWithRelationInput>(query, {
    searchFields: ['name', 'description'],
    sortFields: { name: 'name', createdAt: 'createdAt' },
    defaultSort: [{ field: 'name', direction: 'asc' }],
  });
  const page = await paginate(
    query,
    () => prisma.role.findMany({ ...args, select: roleSelect }),
    () => prisma.role.count({ where: args.where }),
  );
  return { ...page, data: page.data.map(present) };
}

export async function getRole(id: string): Promise<RoleView> {
  const row = await prisma.role.findUnique({ where: { id }, select: roleSelect });
  if (!row) throw notFound('Role');
  return present(row);
}

/** Non-admins may only grant permissions they hold themselves (BR-USER-07). */
function assertCanGrant(actor: Actor, keys: Permission[]): void {
  if (actor.isAdmin) return;
  const missing = keys.filter((k) => !actor.permissions.has(k));
  if (missing.length) {
    throw forbidden(`You cannot grant permissions you do not hold: ${missing.join(', ')}`);
  }
}

/** Case-insensitive uniqueness ("manager" must not shadow "MANAGER"); the DB unique index is the backstop. */
async function assertNameFree(db: Db, name: string, exceptId?: string): Promise<void> {
  const clash = await db.role.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw duplicateName();
}

const duplicateName = () =>
  conflict('A role with this name already exists', ErrorCode.DUPLICATE, [{ field: 'name', message: 'Must be unique' }]);

async function lockRole(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM roles WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function createRole(input: CreateRoleInput, actor: Actor, ctx: RequestContext): Promise<RoleView> {
  assertCanGrant(actor, input.permissions);
  try {
    return await withTransaction(async (tx) => {
      await assertNameFree(tx, input.name);
      const row = await tx.role.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          permissions: { create: input.permissions.map((permissionKey) => ({ permissionKey })) },
        },
        select: roleSelect,
      });
      await recordAudit(tx, ctx, {
        action: 'role.created',
        entityType: 'role',
        entityId: row.id,
        metadata: { name: row.name, permissions: input.permissions },
      });
      return present(row);
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) throw duplicateName();
    throw err;
  }
}

/**
 * Renames / re-describes a role and replaces its permission set. ADMIN is immutable and system
 * roles keep their names (BR-USER-05; code looks them up by name). Non-admins cannot edit their
 * own role or grant permissions they lack (BR-USER-07). Changes apply on the holders' next request.
 */
export async function updateRole(id: string, input: UpdateRoleInput, actor: Actor, ctx: RequestContext): Promise<RoleView> {
  try {
    return await withTransaction(async (tx) => {
      await lockRole(tx, id);
      const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
      if (!role) throw notFound('Role');
      if (isAdminRole(role)) throw businessRule('The ADMIN role cannot be modified');
      if (role.isSystem && input.name !== undefined && input.name !== role.name) {
        throw businessRule('System roles cannot be renamed', [{ field: 'name', message: 'System roles cannot be renamed' }]);
      }
      if (!actor.isAdmin && actor.roleId === id) throw forbidden('You cannot modify your own role');
      if (input.name !== undefined && input.name !== role.name) await assertNameFree(tx, input.name, id);

      const current = role.permissions.map((p) => p.permissionKey);
      const added = input.permissions?.filter((k) => !current.includes(k)) ?? [];
      const removed = input.permissions ? current.filter((k) => !input.permissions!.includes(k as Permission)) : [];
      assertCanGrant(actor, added);

      if (removed.length) await tx.rolePermission.deleteMany({ where: { roleId: id, permissionKey: { in: removed } } });
      if (added.length) await tx.rolePermission.createMany({ data: added.map((permissionKey) => ({ roleId: id, permissionKey })) });
      await tx.role.update({ where: { id }, data: { name: input.name, description: input.description } });

      const changes = diffChanges(
        { name: role.name, description: role.description },
        { name: input.name, description: input.description },
      );
      if (Object.keys(changes).length || added.length || removed.length) {
        await recordAudit(tx, ctx, {
          action: 'role.updated',
          entityType: 'role',
          entityId: id,
          metadata: { changes, permissionsAdded: added, permissionsRemoved: removed } as Prisma.InputJsonValue,
        });
      }
      return present(await tx.role.findUniqueOrThrow({ where: { id }, select: roleSelect }));
    });
  } catch (err) {
    if (isUniqueViolation(err, 'name')) throw duplicateName();
    throw err;
  }
}

/** Deletes a custom role that no user holds (BR-USER-05). The row lock also blocks concurrent assignment. */
export async function deleteRole(id: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (tx) => {
    await lockRole(tx, id);
    const role = await tx.role.findUnique({ where: { id }, select: roleSelect });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw businessRule('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw conflict(`Role is assigned to ${role._count.users} user(s); reassign them first`, ErrorCode.REFERENCED);
    }
    await tx.role.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: 'role.deleted',
      entityType: 'role',
      entityId: id,
      metadata: { name: role.name, permissions: role.permissions.map((p) => p.permissionKey) },
    });
  });
}
