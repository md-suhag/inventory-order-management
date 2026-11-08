import { beforeEach, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { api, bearer, loginAs } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const ROUTE = '/api/v1/roles/permissions'; // requires roles.read (ADMIN only by default)

beforeEach(resetDatabase);

describe('authentication middleware', () => {
  it('rejects missing, malformed and invalid tokens with 401', async () => {
    expect((await api().get(ROUTE)).status).toBe(401);
    expect((await api().get(ROUTE).set('Authorization', 'Token abc')).status).toBe(401);
    const res = await api().get(ROUTE).set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('reports expired tokens distinctly so the client can refresh', async () => {
    const s = await loginAs('ADMIN');
    const expired = jwt.sign({ tv: 0 }, process.env.JWT_ACCESS_SECRET!, {
      subject: s.userId,
      issuer: 'inventory-api',
      audience: 'inventory-app',
      expiresIn: -1,
    });
    const res = await api().get(ROUTE).set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('blocks a deactivated user immediately, even with an unexpired token', async () => {
    const s = await loginAs('ADMIN');
    await prisma.user.update({ where: { id: s.userId }, data: { isActive: false } });
    const res = await api().get(ROUTE).set(bearer(s));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_INACTIVE');
  });
});

describe('authorization (backend-enforced RBAC)', () => {
  it('ADMIN is allowed; MANAGER and STAFF get 403', async () => {
    const admin = await loginAs('ADMIN');
    const res = await api().get(ROUTE).set(bearer(admin)).expect(200);
    expect(res.body.data.map((p: { key: string }) => p.key)).toContain('orders.confirm');

    for (const role of ['MANAGER', 'STAFF']) {
      const s = await loginAs(role);
      const denied = await api().get(ROUTE).set(bearer(s));
      expect(denied.status).toBe(403);
      expect(denied.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('permission changes take effect on the next request (no re-login)', async () => {
    const staff = await loginAs('STAFF');
    await api().get(ROUTE).set(bearer(staff)).expect(403);

    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'STAFF' } });
    await prisma.rolePermission.create({ data: { roleId: role.id, permissionKey: 'roles.read' } });
    await api().get(ROUTE).set(bearer(staff)).expect(200);

    await prisma.rolePermission.delete({ where: { roleId_permissionKey: { roleId: role.id, permissionKey: 'roles.read' } } });
    await api().get(ROUTE).set(bearer(staff)).expect(403);
  });

  it('system ADMIN keeps access even if a grant row is missing (implicit full access)', async () => {
    const admin = await loginAs('ADMIN');
    const role = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await api().get(ROUTE).set(bearer(admin)).expect(200);
  });
});

describe('seeded roles', () => {
  it('match the documented permission matrix', async () => {
    const grants = async (name: string) =>
      (await prisma.rolePermission.findMany({ where: { role: { name } } })).map((g) => g.permissionKey);
    const [admin, manager, staff] = await Promise.all([grants('ADMIN'), grants('MANAGER'), grants('STAFF')]);
    const total = await prisma.permission.count();
    expect(admin).toHaveLength(total);
    expect(manager).not.toContain('users.manage');
    expect(manager).toContain('purchases.receive');
    expect(staff).toContain('orders.confirm');
    expect(staff).not.toContain('products.view_cost');
  });
});
