import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/inventory';

let manager: Session;
let staff: Session;

const makeCategory = (name: string) => prisma.category.create({ data: { name } });

const makeProduct = (
  name: string,
  sku: string,
  stockQuantity: number,
  reorderLevel: number | null,
  categoryId?: string,
  costPrice = '10.00',
  sellingPrice = '20.00',
) =>
  prisma.product.create({
    data: {
      name,
      sku,
      stockQuantity,
      reorderLevel,
      categoryId,
      costPrice,
      sellingPrice,
      status: 'ACTIVE',
    },
  });

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
  staff = await loginAs('STAFF');
});

describe('GET /inventory', () => {
  it('lists inventory with stock states and cost privacy gating', async () => {
    const cat = await makeCategory('Hardware');
    // Default threshold in DB is 10
    const inStock = await makeProduct('Hammer', 'HMR-01', 25, 10, cat.id, '15.00');
    const lowStock = await makeProduct('Nail Box', 'NLB-01', 5, 10, cat.id, '2.00');
    const outOfStock = await makeProduct('Drill', 'DRL-01', 0, 10, cat.id, '50.00');

    // Manager has products.view_cost by default
    const resManager = await api().get(BASE).set(bearer(manager)).expect(200);
    expect(resManager.body.meta.total).toBe(3);

    const items = resManager.body.data;
    const hammer = items.find((i: { id: string }) => i.id === inStock.id);
    const nail = items.find((i: { id: string }) => i.id === lowStock.id);
    const drill = items.find((i: { id: string }) => i.id === outOfStock.id);

    expect(hammer.stockState).toBe('IN_STOCK');
    expect(hammer.costPrice).toBe('15.0000');
    expect(hammer.stockValue).toBe('375.00');

    expect(nail.stockState).toBe('LOW');
    expect(drill.stockState).toBe('OUT');

    // Filter by stockState
    const lowOnly = await api().get(BASE).set(bearer(manager)).query({ stockState: 'LOW' }).expect(200);
    expect(lowOnly.body.meta.total).toBe(1);
    expect(lowOnly.body.data[0].id).toBe(lowStock.id);

    // Staff has inventory.read but NOT products.view_cost by default
    const resStaff = await api().get(BASE).set(bearer(staff)).expect(200);
    expect(resStaff.body.data[0].costPrice).toBeUndefined();
    expect(resStaff.body.data[0].stockValue).toBeUndefined();
  });

  it('GET /inventory/low-stock returns only low stock items', async () => {
    await makeProduct('Good Stock', 'GD-01', 50, 10);
    const low1 = await makeProduct('Low Stock 1', 'LW-01', 3, 10);
    await makeProduct('Out of Stock', 'OUT-01', 0, 10); // 0 stock is OUT, not LOW

    const res = await api().get(`${BASE}/low-stock`).set(bearer(manager)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(low1.id);
  });
});

describe('POST /inventory/adjustments', () => {
  it('increases stock on ADJUSTMENT_IN and retains weighted-average cost', async () => {
    const p = await makeProduct('Bolt', 'BLT-01', 10, 5, undefined, '5.00');

    const res = await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'adj-key-001')
      .send({
        productId: p.id,
        direction: 'IN',
        quantity: 5,
        reason: 'FOUND',
        notes: 'Found in backroom shelf',
      })
      .expect(201);

    expect(res.body.data.quantityChange).toBe(5);
    expect(res.body.data.previousStock).toBe(10);
    expect(res.body.data.resultingStock).toBe(15);
    expect(res.body.data.adjustmentReason).toBe('FOUND');

    const updated = await prisma.product.findUnique({ where: { id: p.id } });
    expect(updated!.stockQuantity).toBe(15);
    expect(updated!.costPrice.toString()).toBe('5'); // Cost unchanged on ADJUSTMENT_IN
  });

  it('decreases stock on ADJUSTMENT_OUT and prevents negative stock', async () => {
    const p = await makeProduct('Screw', 'SCR-01', 5, 2);

    const res = await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'adj-key-002')
      .send({
        productId: p.id,
        direction: 'OUT',
        quantity: 2,
        reason: 'DAMAGED',
        notes: 'Broken in transit',
      })
      .expect(201);

    expect(res.body.data.quantityChange).toBe(-2);
    expect(res.body.data.resultingStock).toBe(3);

    // Attempting to deduct more than remaining stock is rejected (BR-INV-02)
    await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'adj-key-003')
      .send({
        productId: p.id,
        direction: 'OUT',
        quantity: 10,
        reason: 'LOST',
      })
      .expect(422);
  });

  it('requires notes when reason is OTHER (BR-INV-03)', async () => {
    const p = await makeProduct('Cable', 'CBL-01', 10, 5);

    await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'adj-key-other')
      .send({
        productId: p.id,
        direction: 'OUT',
        quantity: 1,
        reason: 'OTHER',
        notes: '',
      })
      .expect(422);
  });

  it('enforces idempotency replay and prevents reuse with different payload', async () => {
    const p = await makeProduct('Wire', 'WR-01', 20, 5);
    const key = 'adj-idem-key-test';

    const first = await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', key)
      .send({
        productId: p.id,
        direction: 'IN',
        quantity: 5,
        reason: 'COUNT_CORRECTION',
      })
      .expect(201);

    // Replay with identical payload returns original
    const replay = await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', key)
      .send({
        productId: p.id,
        direction: 'IN',
        quantity: 5,
        reason: 'COUNT_CORRECTION',
      })
      .expect(200);

    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(first.body.data.id);

    // Same key with different payload returns 422
    await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', key)
      .send({
        productId: p.id,
        direction: 'OUT',
        quantity: 1,
        reason: 'DAMAGED',
      })
      .expect(422);
  });

  it('STAFF cannot make manual adjustments without permission', async () => {
    const p = await makeProduct('Wire', 'WR-02', 20, 5);

    await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(staff))
      .set('Idempotency-Key', 'staff-adj')
      .send({
        productId: p.id,
        direction: 'IN',
        quantity: 1,
        reason: 'FOUND',
      })
      .expect(403);
  });
});

describe('Movement History (GET /inventory/movements)', () => {
  it('lists movements with filters and masks unitCost without permission', async () => {
    const p = await makeProduct('Pipe', 'PP-01', 10, 5, undefined, '12.00');

    // Make an adjustment
    await api()
      .post(`${BASE}/adjustments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'mov-key-1')
      .send({
        productId: p.id,
        direction: 'IN',
        quantity: 5,
        reason: 'FOUND',
      })
      .expect(201);

    const resManager = await api().get(`${BASE}/movements`).set(bearer(manager)).expect(200);
    expect(resManager.body.meta.total).toBe(1);
    expect(resManager.body.data[0].productSku).toBe('PP-01');
    expect(resManager.body.data[0].type).toBe('ADJUSTMENT_IN');
    expect(resManager.body.data[0].unitCost).toBe('12.0000');

    // Staff sees movement but unitCost is masked
    const resStaff = await api().get(`${BASE}/movements`).set(bearer(staff)).expect(200);
    expect(resStaff.body.data[0].unitCost).toBeUndefined();

    // Get movement by ID
    const movId = resManager.body.data[0].id;
    const detail = await api().get(`${BASE}/movements/${movId}`).set(bearer(manager)).expect(200);
    expect(detail.body.data.id).toBe(movId);
  });
});
