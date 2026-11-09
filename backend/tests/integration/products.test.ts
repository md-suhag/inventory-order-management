import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/products';

let manager: Session;
let seq = 0;

interface ProductSeed {
  stockQuantity?: number;
  reorderLevel?: number | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  name?: string;
  categoryId?: string;
}

const makeProduct = (data: ProductSeed = {}) => {
  seq += 1;
  return prisma.product.create({
    data: { sku: `SKU-${seq}`, name: data.name ?? `Product ${seq}`, sellingPrice: '10.00', costPrice: '6.5000', ...data },
  });
};

/** A role with product management but without products.view_cost. */
async function loginWithoutCost(): Promise<Session> {
  const role = await prisma.role.create({
    data: {
      name: 'Catalogue Editor',
      permissions: { create: [{ permissionKey: 'products.read' }, { permissionKey: 'products.manage' }] },
    },
  });
  return loginAs(role.name);
}

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
});

describe('POST /products', () => {
  it('creates a product with opening stock as an OPENING_STOCK movement (FR-PROD-02)', async () => {
    const category = await prisma.category.create({ data: { name: 'Drinks' } });
    const res = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        sku: ' tea-01 ',
        name: 'Green Tea',
        sellingPrice: '120.00',
        costPrice: '80.5',
        openingStock: 25,
        categoryId: category.id,
        taxRate: '5',
      })
      .expect(201);
    expect(res.body.data).toMatchObject({
      sku: 'TEA-01',
      stockQuantity: 25,
      costPrice: '80.5',
      sellingPrice: '120',
      stockState: 'IN_STOCK',
      lowStockThreshold: 10,
      category: { id: category.id, name: 'Drinks' },
    });
    const id = res.body.data.id;

    const movements = await prisma.inventoryMovement.findMany({ where: { productId: id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'OPENING_STOCK',
      quantityChange: 25,
      previousStock: 0,
      resultingStock: 25,
      performedById: manager.userId,
    });
    expect(movements[0]!.unitCost!.toString()).toBe('80.5');
    expect(await prisma.auditLog.count({ where: { action: 'product.created', entityId: id } })).toBe(1);
  });

  it('rejects duplicate SKU (normalised to upper case) and barcode', async () => {
    await api().post(BASE).set(bearer(manager)).send({ sku: 'A1', name: 'A', sellingPrice: '1', barcode: '123' }).expect(201);
    const sku = await api().post(BASE).set(bearer(manager)).send({ sku: 'a1', name: 'B', sellingPrice: '1' });
    expect(sku.status).toBe(409);
    expect(sku.body.error).toMatchObject({ code: 'DUPLICATE', details: [{ field: 'sku' }] });
    const barcode = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ sku: 'A2', name: 'B', sellingPrice: '1', barcode: '123' });
    expect(barcode.body.error).toMatchObject({ code: 'DUPLICATE', details: [{ field: 'barcode' }] });
  });

  it('rejects archived categories', async () => {
    const archived = await prisma.category.create({ data: { name: 'Old', status: 'ARCHIVED' } });
    const res = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ sku: 'X', name: 'X', sellingPrice: '1', categoryId: archived.id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INVALID_REFERENCE');
  });

  it('setting cost requires products.view_cost; responses hide cost without it', async () => {
    const editor = await loginWithoutCost();
    const denied = await api()
      .post(BASE)
      .set(bearer(editor))
      .send({ sku: 'C1', name: 'C', sellingPrice: '1', costPrice: '1' });
    expect(denied.status).toBe(403);
    const ok = await api().post(BASE).set(bearer(editor)).send({ sku: 'C1', name: 'C', sellingPrice: '1' }).expect(201);
    expect(ok.body.data).not.toHaveProperty('costPrice');
  });
});

describe('GET /products', () => {
  it('filters by stock state, status and category; searches name/SKU/barcode', async () => {
    const cat = await prisma.category.create({ data: { name: 'Snacks' } });
    await makeProduct({ name: 'Out', stockQuantity: 0 });
    await makeProduct({ name: 'Low default', stockQuantity: 10 }); // default threshold 10
    await makeProduct({ name: 'Low own', stockQuantity: 4, reorderLevel: 5, categoryId: cat.id });
    await makeProduct({ name: 'Healthy', stockQuantity: 6, reorderLevel: 5 });
    await makeProduct({ name: 'Archived', stockQuantity: 50, status: 'ARCHIVED' });

    const names = async (query: Record<string, string>): Promise<string[]> =>
      (await api().get(BASE).set(bearer(manager)).query(query).expect(200)).body.data.map((p: { name: string }) => p.name);

    expect(await names({ stockState: 'LOW' })).toEqual(['Low default', 'Low own']);
    expect(await names({ stockState: 'OUT,LOW', sort: 'stockQuantity:asc' })).toEqual(['Out', 'Low own', 'Low default']);
    expect(await names({ stockState: 'IN_STOCK', status: 'ACTIVE' })).toEqual(['Healthy']);
    expect(await names({ categoryId: cat.id })).toEqual(['Low own']);
    expect(await names({ search: 'Healthy' })).toEqual(['Healthy']);
  });

  it('STAFF sees products without cost fields and cannot create', async () => {
    await makeProduct({ stockQuantity: 3 });
    const staff = await loginAs('STAFF');
    const res = await api().get(BASE).set(bearer(staff)).expect(200);
    expect(res.body.data[0]).not.toHaveProperty('costPrice');
    expect(res.body.data[0]).toMatchObject({ stockState: 'LOW', sellingPrice: '10' });
    const denied = await api().post(BASE).set(bearer(staff)).send({ sku: 'S', name: 'S', sellingPrice: '1' });
    expect(denied.status).toBe(403);
  });
});

describe('GET /products/:id', () => {
  it('includes recent movements, hiding unit cost without products.view_cost', async () => {
    const created = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ sku: 'M1', name: 'M', sellingPrice: '5', costPrice: '2', openingStock: 3 })
      .expect(201);
    const url = `${BASE}/${created.body.data.id}`;
    const full = await api().get(url).set(bearer(manager)).expect(200);
    expect(full.body.data.recentMovements).toHaveLength(1);
    expect(full.body.data.recentMovements[0]).toMatchObject({
      type: 'OPENING_STOCK',
      unitCost: '2',
      performedBy: { id: manager.userId },
    });
    expect(full.body.data.images).toEqual([]);

    const staff = await loginAs('STAFF');
    const limited = await api().get(url).set(bearer(staff)).expect(200);
    expect(limited.body.data).not.toHaveProperty('costPrice');
    expect(limited.body.data.recentMovements[0]).not.toHaveProperty('unitCost');
  });
});

describe('PATCH /products/:id', () => {
  it('updates fields with an audited diff; stock cannot be edited directly', async () => {
    const p = await makeProduct();
    const res = await api()
      .patch(`${BASE}/${p.id}`)
      .set(bearer(manager))
      .send({ sellingPrice: '12.5', costPrice: '7', reorderLevel: 3 })
      .expect(200);
    expect(res.body.data).toMatchObject({ sellingPrice: '12.5', costPrice: '7', reorderLevel: 3, lowStockThreshold: 3 });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'product.updated', entityId: p.id } });
    expect(audit.metadata).toMatchObject({ changes: { sellingPrice: { to: '12.5' }, costPrice: { to: '7' } } });

    const stock = await api().patch(`${BASE}/${p.id}`).set(bearer(manager)).send({ stockQuantity: 100 });
    expect(stock.status).toBe(422);
  });

  it('archived products must be unarchived before a status change', async () => {
    const p = await makeProduct({ status: 'ARCHIVED' });
    const res = await api().patch(`${BASE}/${p.id}`).set(bearer(manager)).send({ status: 'ACTIVE' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });
});

describe('archive / unarchive / delete', () => {
  it('archive is idempotent; unarchive restores ACTIVE', async () => {
    const p = await makeProduct();
    await api().post(`${BASE}/${p.id}/archive`).set(bearer(manager)).expect(200);
    const again = await api().post(`${BASE}/${p.id}/archive`).set(bearer(manager)).expect(200);
    expect(again.body.data.status).toBe('ARCHIVED');
    expect(await prisma.auditLog.count({ where: { action: 'product.archived', entityId: p.id } })).toBe(1);
    const on = await api().post(`${BASE}/${p.id}/unarchive`).set(bearer(manager)).expect(200);
    expect(on.body.data.status).toBe('ACTIVE');
  });

  it('deletes products without history; products with movements return 409 REFERENCED (BR-PROD-02)', async () => {
    const fresh = await makeProduct();
    await api().delete(`${BASE}/${fresh.id}`).set(bearer(manager)).expect(204);
    expect(await prisma.product.findUnique({ where: { id: fresh.id } })).toBeNull();

    const stocked = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ sku: 'H1', name: 'H', sellingPrice: '1', openingStock: 1 })
      .expect(201);
    const res = await api().delete(`${BASE}/${stocked.body.data.id}`).set(bearer(manager));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFERENCED');
  });
});
