import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, login, loginAs, type Session } from '../helpers/app';
import { createUser, DEFAULT_PASSWORD, prisma, resetDatabase } from '../helpers/db';
import * as usersService from '../../src/modules/users/users.service';

const BASE = '/api/v1/users';

const roleId = async (name: string) => (await prisma.role.findUniqueOrThrow({ where: { name } })).id;

let admin: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await loginAs('ADMIN');
});

describe('GET /users', () => {
  it('lists users with pagination, search, filters and sort; never exposes secrets', async () => {
    await createUser({ name: 'Alice Staff', email: 'alice@test.local' });
    await createUser({ name: 'Bob Manager', email: 'bob@test.local', role: 'MANAGER' });
    await createUser({ name: 'Carol Inactive', email: 'carol@test.local', isActive: false });

    const all = await api().get(BASE).set(bearer(admin)).query({ pageSize: 2, sort: 'name:asc' }).expect(200);
    expect(all.body.meta).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(all.body.data.map((u: { name: string }) => u.name)).toEqual(['Alice Staff', 'Bob Manager']);
    expect(all.body.data[0]).not.toHaveProperty('passwordHash');
    expect(all.body.data[0]).not.toHaveProperty('tokenVersion');
    expect(all.body.data[0].role).toEqual({ id: expect.any(String), name: 'STAFF' });

    const search = await api().get(BASE).set(bearer(admin)).query({ search: 'BOB@' }).expect(200);
    expect(search.body.data.map((u: { email: string }) => u.email)).toEqual(['bob@test.local']);

    const inactive = await api().get(BASE).set(bearer(admin)).query({ isActive: 'false' }).expect(200);
    expect(inactive.body.data.map((u: { email: string }) => u.email)).toEqual(['carol@test.local']);

    const managers = await api().get(BASE).set(bearer(admin)).query({ roleId: await roleId('MANAGER') }).expect(200);
    expect(managers.body.data.map((u: { email: string }) => u.email)).toEqual(['bob@test.local']);
  });

  it('rejects unknown sort fields and requires users.read', async () => {
    const bad = await api().get(BASE).set(bearer(admin)).query({ sort: 'passwordHash:asc' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details[0].field).toBe('query.sort');

    const manager = await loginAs('MANAGER');
    expect((await api().get(BASE).set(bearer(manager))).body.error.code).toBe('FORBIDDEN');
  });

  it('GET /users/:id returns 404 for unknown ids and 422 for malformed ids', async () => {
    await api().get(`${BASE}/${admin.userId}`).set(bearer(admin)).expect(200);
    const missing = await api().get(`${BASE}/0190f3a0-0000-7000-8000-000000000000`).set(bearer(admin));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await api().get(`${BASE}/nope`).set(bearer(admin))).status).toBe(422);
  });
});

describe('POST /users', () => {
  it('creates an active user who can log in, and audits it', async () => {
    const res = await api()
      .post(BASE)
      .set(bearer(admin))
      .send({ name: 'New Staff', email: 'New.Staff@Test.local', roleId: await roleId('STAFF'), password: 'Welcome123' })
      .expect(201);
    expect(res.body.data).toMatchObject({ email: 'new.staff@test.local', isActive: true, role: { name: 'STAFF' } });

    const row = await prisma.user.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(row.createdById).toBe(admin.userId);
    await login('new.staff@test.local', 'Welcome123');

    const audit = await prisma.auditLog.findFirst({ where: { action: 'user.created', entityId: row.id } });
    expect(audit?.actorId).toBe(admin.userId);
  });

  it('rejects duplicate emails, unknown roles and weak passwords', async () => {
    const staff = await roleId('STAFF');
    await createUser({ email: 'taken@test.local' });
    const dup = await api()
      .post(BASE)
      .set(bearer(admin))
      .send({ name: 'X', email: 'taken@test.local', roleId: staff, password: 'Welcome123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');

    const badRole = await api()
      .post(BASE)
      .set(bearer(admin))
      .send({ name: 'X', email: 'x@test.local', roleId: '0190f3a0-0000-7000-8000-000000000000', password: 'Welcome123' });
    expect(badRole.status).toBe(422);
    expect(badRole.body.error.code).toBe('INVALID_REFERENCE');

    const weak = await api()
      .post(BASE)
      .set(bearer(admin))
      .send({ name: 'X', email: 'y@test.local', roleId: staff, password: 'short' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.details.map((d: { field: string }) => d.field)).toContain('password');
  });
});

describe('PATCH /users/:id', () => {
  it('updates name/phone and records a field diff', async () => {
    const user = await createUser({ name: 'Old Name' });
    const res = await api()
      .patch(`${BASE}/${user.id}`)
      .set(bearer(admin))
      .send({ name: 'New Name', phone: '+880 1711-000000', email: 'ignored@test.local' })
      .expect(200);
    expect(res.body.data).toMatchObject({ name: 'New Name', phone: '+880 1711-000000', email: user.email });

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'user.updated', entityId: user.id } });
    expect(audit.metadata).toMatchObject({ changes: { name: { from: 'Old Name', to: 'New Name' } } });
  });

  it('role change revokes the user’s sessions immediately (BR-USER-04)', async () => {
    const staff = await loginAs('STAFF');
    await api().get('/api/v1/auth/me').set(bearer(staff)).expect(200);

    const res = await api()
      .patch(`${BASE}/${staff.userId}`)
      .set(bearer(admin))
      .send({ roleId: await roleId('MANAGER') })
      .expect(200);
    expect(res.body.data.role.name).toBe('MANAGER');

    const me = await api().get('/api/v1/auth/me').set(bearer(staff));
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe('INVALID_TOKEN');
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: staff.refreshToken })).status).toBe(401);
    expect(await prisma.auditLog.count({ where: { action: 'user.role_changed', entityId: staff.userId } })).toBe(1);
  });

  it('a user cannot change their own role (BR-USER-03)', async () => {
    await createUser({ role: 'ADMIN' }); // so the last-admin rule is not what blocks it
    const res = await api()
      .patch(`${BASE}/${admin.userId}`)
      .set(bearer(admin))
      .send({ roleId: await roleId('STAFF') });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('the last active admin cannot be demoted or deactivated, even by a privileged caller (BR-USER-02)', async () => {
    // Through the API this is only reachable via races (self-changes are blocked), so exercise the
    // service guard directly with an actor that is not the target.
    await createUser({ role: 'ADMIN', isActive: false }); // inactive admins do not count
    const actor = { userId: '0190f3a0-0000-7000-8000-000000000001', isAdmin: true };
    const ctx = { actorId: null };
    await expect(usersService.updateUser(admin.userId, { roleId: await roleId('STAFF') }, actor, ctx)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
    await expect(usersService.setUserActive(admin.userId, false, actor, ctx)).rejects.toMatchObject({
      code: 'BUSINESS_RULE_VIOLATION',
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: admin.userId }, include: { role: true } });
    expect(row).toMatchObject({ isActive: true, role: { name: 'ADMIN' } });
  });

  it('two admins demoting each other concurrently: exactly one succeeds (BR-USER-02)', async () => {
    const otherUser = await createUser({ role: 'ADMIN' });
    const other = await login(otherUser.email);
    const staffRole = await roleId('STAFF');

    const [a, b] = await Promise.all([
      api().patch(`${BASE}/${other.userId}`).set(bearer(admin)).send({ roleId: staffRole }),
      api().patch(`${BASE}/${admin.userId}`).set(bearer(other)).send({ roleId: staffRole }),
    ]);
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect(await prisma.user.count({ where: { isActive: true, role: { name: 'ADMIN' } } })).toBe(1);
  });

  it('non-admins with users.manage cannot touch admins or grant ADMIN (BR-USER-06)', async () => {
    const custom = await prisma.role.create({
      data: { name: 'HR', permissions: { create: [{ permissionKey: 'users.read' }, { permissionKey: 'users.manage' }] } },
    });
    const hr = await loginAs(custom.name);
    const staff = await createUser();

    const promote = await api().patch(`${BASE}/${staff.id}`).set(bearer(hr)).send({ roleId: await roleId('ADMIN') });
    expect(promote.status).toBe(403);
    const editAdmin = await api().patch(`${BASE}/${admin.userId}`).set(bearer(hr)).send({ name: 'Hacked' });
    expect(editAdmin.status).toBe(403);
    const deactivateAdmin = await api().post(`${BASE}/${admin.userId}/deactivate`).set(bearer(hr));
    expect(deactivateAdmin.status).toBe(403);
    const createAdmin = await api()
      .post(BASE)
      .set(bearer(hr))
      .send({ name: 'X', email: 'x@test.local', roleId: await roleId('ADMIN'), password: 'Welcome123' });
    expect(createAdmin.status).toBe(403);

    // but ordinary user management works
    await api().patch(`${BASE}/${staff.id}`).set(bearer(hr)).send({ roleId: await roleId('MANAGER') }).expect(200);
  });
});

describe('activate / deactivate', () => {
  it('deactivation blocks login and revokes sessions; activation restores access and clears lockout', async () => {
    const staff = await loginAs('STAFF');

    const off = await api().post(`${BASE}/${staff.userId}/deactivate`).set(bearer(admin)).expect(200);
    expect(off.body.data.isActive).toBe(false);
    expect((await api().get('/api/v1/auth/me').set(bearer(staff))).status).toBe(401);
    const denied = await api().post('/api/v1/auth/login').send({ email: staff.email, password: DEFAULT_PASSWORD });
    expect(denied.body.error.code).toBe('ACCOUNT_INACTIVE');

    // idempotent: repeating does not add another audit row
    await api().post(`${BASE}/${staff.userId}/deactivate`).set(bearer(admin)).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'user.deactivated', entityId: staff.userId } })).toBe(1);

    await prisma.user.update({ where: { id: staff.userId }, data: { lockedUntil: new Date(Date.now() + 60_000) } });
    const on = await api().post(`${BASE}/${staff.userId}/activate`).set(bearer(admin)).expect(200);
    expect(on.body.data.isActive).toBe(true);
    await login(staff.email);
  });

  it('a user cannot deactivate themselves (BR-USER-03)', async () => {
    const res = await api().post(`${BASE}/${admin.userId}/deactivate`).set(bearer(admin));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('two admins deactivating each other concurrently: exactly one succeeds (BR-USER-02)', async () => {
    const otherUser = await createUser({ role: 'ADMIN' });
    const other = await login(otherUser.email);

    const [a, b] = await Promise.all([
      api().post(`${BASE}/${other.userId}/deactivate`).set(bearer(admin)),
      api().post(`${BASE}/${admin.userId}/deactivate`).set(bearer(other)),
    ]);
    // The loser is rejected by the guard (422) or, if the winner committed before it authenticated, 401/403.
    expect([a.status, b.status].filter((s) => s === 200)).toHaveLength(1);
    expect(await prisma.user.count({ where: { isActive: true, role: { name: 'ADMIN' } } })).toBe(1);
  });
});
