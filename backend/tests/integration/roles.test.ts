import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '../../src/common/auth/permissions';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { createUser, prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/roles';

const role = (name: string) => prisma.role.findUniqueOrThrow({ where: { name } });
const grants = async (roleId: string) =>
  (await prisma.rolePermission.findMany({ where: { roleId } })).map((g) => g.permissionKey).sort();

let admin: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await loginAs('ADMIN');
});

describe('GET /roles', () => {
  it('lists roles with permissions and user counts', async () => {
    await createUser({ role: 'STAFF' });
    await createUser({ role: 'STAFF' });

    const res = await api().get(BASE).set(bearer(admin)).expect(200);
    expect(res.body.data.map((r: { name: string }) => r.name)).toEqual(['ADMIN', 'MANAGER', 'STAFF']);
    const [adminRole, , staff] = res.body.data;
    expect(adminRole).toMatchObject({ isSystem: true, userCount: 1 });
    expect(adminRole.permissions).toHaveLength(ALL_PERMISSIONS.length);
    expect(staff.userCount).toBe(2);
    expect(staff.permissions).toContain('orders.confirm');
    expect(staff.permissions).not.toContain('users.manage');

    const search = await api().get(BASE).set(bearer(admin)).query({ search: 'manag' }).expect(200);
    expect(search.body.data.map((r: { name: string }) => r.name)).toEqual(['MANAGER']);
  });

  it('GET /roles/:id returns one role; 404 when unknown; MANAGER cannot read roles', async () => {
    const staff = await role('STAFF');
    const one = await api().get(`${BASE}/${staff.id}`).set(bearer(admin)).expect(200);
    expect(one.body.data.name).toBe('STAFF');
    expect((await api().get(`${BASE}/0190f3a0-0000-7000-8000-000000000000`).set(bearer(admin))).status).toBe(404);

    const manager = await loginAs('MANAGER');
    expect((await api().get(BASE).set(bearer(manager))).status).toBe(403);
  });
});

describe('POST /roles', () => {
  it('creates a custom role with deduplicated permissions and audits it', async () => {
    const res = await api()
      .post(BASE)
      .set(bearer(admin))
      .send({ name: 'Warehouse', description: 'Receiving team', permissions: ['inventory.read', 'purchases.receive', 'inventory.read'] })
      .expect(201);
    expect(res.body.data).toMatchObject({
      name: 'Warehouse',
      isSystem: false,
      userCount: 0,
      permissions: ['inventory.read', 'purchases.receive'],
    });
    expect(await grants(res.body.data.id)).toEqual(['inventory.read', 'purchases.receive']);
    expect(await prisma.auditLog.count({ where: { action: 'role.created', entityId: res.body.data.id } })).toBe(1);
  });

  it('rejects unknown permissions and case-insensitive duplicate names', async () => {
    const bad = await api().post(BASE).set(bearer(admin)).send({ name: 'X1', permissions: ['orders.read', 'nope.nothing'] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].field).toBe('permissions.1');

    const dup = await api().post(BASE).set(bearer(admin)).send({ name: 'manager' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });
});

describe('PATCH /roles/:id', () => {
  it('replaces the permission set; holders get the change on their next request', async () => {
    const custom = await prisma.role.create({
      data: { name: 'Auditor', permissions: { create: [{ permissionKey: 'orders.read' }] } },
    });
    const holder = await loginAs('Auditor');
    await api().get('/api/v1/roles/permissions').set(bearer(holder)).expect(403);

    const res = await api()
      .patch(`${BASE}/${custom.id}`)
      .set(bearer(admin))
      .send({ name: 'Auditors', permissions: ['roles.read', 'audit_logs.read'] })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'Auditors', permissions: ['audit_logs.read', 'roles.read'] });
    await api().get('/api/v1/roles/permissions').set(bearer(holder)).expect(200);

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'role.updated', entityId: custom.id } });
    expect(audit.metadata).toMatchObject({
      changes: { name: { from: 'Auditor', to: 'Auditors' } },
      permissionsAdded: ['audit_logs.read', 'roles.read'],
      permissionsRemoved: ['orders.read'],
    });
  });

  it('ADMIN is immutable; system roles cannot be renamed but their permissions can change (BR-USER-05)', async () => {
    const adminRole = await role('ADMIN');
    const locked = await api().patch(`${BASE}/${adminRole.id}`).set(bearer(admin)).send({ permissions: [] });
    expect(locked.status).toBe(422);
    expect(locked.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect((await grants(adminRole.id)).length).toBe(ALL_PERMISSIONS.length);

    const staff = await role('STAFF');
    const rename = await api().patch(`${BASE}/${staff.id}`).set(bearer(admin)).send({ name: 'Cashier' });
    expect(rename.status).toBe(422);

    await api().patch(`${BASE}/${staff.id}`).set(bearer(admin)).send({ permissions: ['orders.read'] }).expect(200);
    expect(await grants(staff.id)).toEqual(['orders.read']);
  });

  it('non-admin role managers cannot edit their own role or grant permissions they lack (BR-USER-07)', async () => {
    const rm = await prisma.role.create({
      data: {
        name: 'RoleManager',
        permissions: { create: ['roles.read', 'roles.manage', 'orders.read'].map((permissionKey) => ({ permissionKey })) },
      },
    });
    const s = await loginAs('RoleManager');
    const staff = await role('STAFF');

    const own = await api().patch(`${BASE}/${rm.id}`).set(bearer(s)).send({ permissions: ['roles.read', 'roles.manage', 'users.manage'] });
    expect(own.status).toBe(403);

    const escalate = await api().patch(`${BASE}/${staff.id}`).set(bearer(s)).send({ permissions: ['users.manage'] });
    expect(escalate.status).toBe(403);
    const create = await api().post(BASE).set(bearer(s)).send({ name: 'Sneaky', permissions: ['settings.update'] });
    expect(create.status).toBe(403);

    // granting what they hold, and removing anything, is fine
    await api().patch(`${BASE}/${staff.id}`).set(bearer(s)).send({ permissions: ['orders.read'] }).expect(200);
  });
});

describe('DELETE /roles/:id', () => {
  it('deletes an unused custom role and its grants', async () => {
    const custom = await prisma.role.create({ data: { name: 'Temp', permissions: { create: [{ permissionKey: 'orders.read' }] } } });
    await api().delete(`${BASE}/${custom.id}`).set(bearer(admin)).expect(204);
    expect(await prisma.role.findUnique({ where: { id: custom.id } })).toBeNull();
    expect(await prisma.rolePermission.count({ where: { roleId: custom.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'role.deleted', entityId: custom.id } })).toBe(1);
  });

  it('refuses system roles (422) and roles that still have users (409 REFERENCED)', async () => {
    const staff = await role('STAFF');
    const sys = await api().delete(`${BASE}/${staff.id}`).set(bearer(admin));
    expect(sys.status).toBe(422);

    const custom = await prisma.role.create({ data: { name: 'InUse' } });
    await createUser({ role: 'InUse' });
    const used = await api().delete(`${BASE}/${custom.id}`).set(bearer(admin));
    expect(used.status).toBe(409);
    expect(used.body.error.code).toBe('REFERENCED');
    expect(await prisma.role.findUnique({ where: { id: custom.id } })).not.toBeNull();
  });
});
