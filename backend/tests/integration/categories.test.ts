import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/categories';

let manager: Session;

const makeCategory = (name: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') =>
  prisma.category.create({ data: { name, status } });

let sku = 0;
const makeProduct = (categoryId: string) =>
  prisma.product.create({ data: { sku: `SKU-${++sku}`, name: `Product ${sku}`, sellingPrice: '10.00', categoryId } });

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
});

describe('GET /categories', () => {
  it('lists with product counts, search, status filter and sort', async () => {
    const drinks = await makeCategory('Drinks');
    await makeCategory('Snacks');
    await makeCategory('Old Stock', 'ARCHIVED');
    await makeProduct(drinks.id);
    await makeProduct(drinks.id);

    const all = await api().get(BASE).set(bearer(manager)).expect(200);
    expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(['Drinks', 'Old Stock', 'Snacks']);
    expect(all.body.data[0]).toMatchObject({ status: 'ACTIVE', productCount: 2 });

    const active = await api().get(BASE).set(bearer(manager)).query({ status: 'ACTIVE' }).expect(200);
    expect(active.body.meta.total).toBe(2);

    const byCount = await api().get(BASE).set(bearer(manager)).query({ sort: 'productCount:desc' }).expect(200);
    expect(byCount.body.data[0].name).toBe('Drinks');

    const search = await api().get(BASE).set(bearer(manager)).query({ search: 'snack' }).expect(200);
    expect(search.body.data.map((c: { name: string }) => c.name)).toEqual(['Snacks']);
  });

  it('STAFF can read but not manage', async () => {
    const staff = await loginAs('STAFF');
    await api().get(BASE).set(bearer(staff)).expect(200);
    const denied = await api().post(BASE).set(bearer(staff)).send({ name: 'X' });
    expect(denied.status).toBe(403);
  });
});

describe('POST / PATCH /categories', () => {
  it('creates and renames with audit, rejecting case-insensitive duplicates', async () => {
    const created = await api().post(BASE).set(bearer(manager)).send({ name: '  Beverages ', description: 'Cold drinks' }).expect(201);
    expect(created.body.data).toMatchObject({ name: 'Beverages', description: 'Cold drinks', status: 'ACTIVE', productCount: 0 });
    const id = created.body.data.id;

    const dup = await api().post(BASE).set(bearer(manager)).send({ name: 'BEVERAGES' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');

    await makeCategory('Snacks');
    const clash = await api().patch(`${BASE}/${id}`).set(bearer(manager)).send({ name: 'snacks' });
    expect(clash.status).toBe(409);

    const renamed = await api().patch(`${BASE}/${id}`).set(bearer(manager)).send({ name: 'Drinks', description: '' }).expect(200);
    expect(renamed.body.data).toMatchObject({ name: 'Drinks', description: null });

    const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['category.created', 'category.updated']);
  });

  it('validates input and returns 404 for unknown ids', async () => {
    const empty = await api().post(BASE).set(bearer(manager)).send({ name: '   ' });
    expect(empty.status).toBe(422);
    const missing = await api().patch(`${BASE}/0190f3a0-0000-7000-8000-000000000000`).set(bearer(manager)).send({ name: 'X' });
    expect(missing.status).toBe(404);
  });
});

describe('archive / unarchive / delete', () => {
  it('archive and unarchive are idempotent and audited once each', async () => {
    const c = await makeCategory('Seasonal');
    const off = await api().post(`${BASE}/${c.id}/archive`).set(bearer(manager)).expect(200);
    expect(off.body.data.status).toBe('ARCHIVED');
    await api().post(`${BASE}/${c.id}/archive`).set(bearer(manager)).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'category.archived', entityId: c.id } })).toBe(1);

    const on = await api().post(`${BASE}/${c.id}/unarchive`).set(bearer(manager)).expect(200);
    expect(on.body.data.status).toBe('ACTIVE');
  });

  it('deletes unused categories; referenced ones return 409 REFERENCED (BR-CAT-01)', async () => {
    const unused = await makeCategory('Unused');
    await api().delete(`${BASE}/${unused.id}`).set(bearer(manager)).expect(204);
    expect(await prisma.category.findUnique({ where: { id: unused.id } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'category.deleted', entityId: unused.id } })).toBe(1);

    const used = await makeCategory('Used');
    await makeProduct(used.id);
    const res = await api().delete(`${BASE}/${used.id}`).set(bearer(manager));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFERENCED');
    expect(await prisma.category.findUnique({ where: { id: used.id } })).not.toBeNull();
  });
});
