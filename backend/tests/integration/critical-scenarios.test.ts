import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

let manager: Session;
let staff: Session;

async function makeSupplier(name = 'Test Supplier') {
  return prisma.supplier.create({ data: { name } });
}

async function makeCustomer(name = 'Test Customer') {
  return prisma.customer.create({ data: { name, phone: '555-0100' } });
}

async function makeProduct(opts: { name: string; sku: string; cost?: string; price?: string; stock: number }) {
  return prisma.product.create({
    data: {
      name: opts.name,
      sku: opts.sku,
      unit: 'pcs',
      costPrice: opts.cost ?? '10.0000',
      sellingPrice: opts.price ?? '25.00',
      stockQuantity: opts.stock,
      status: 'ACTIVE',
    },
  });
}

async function getActivePaymentMethodId() {
  const pm = await prisma.paymentMethod.findFirstOrThrow({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });
  return pm.id;
}

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
  staff = await loginAs('STAFF');
});

describe('Critical concurrency, idempotency, rollback & security scenarios (TESTING_STRATEGY §4)', () => {
  it('1. Two concurrent orders for the last unit: exactly one confirms, stock=0, single SALE movement', async () => {
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'Last Unit Item', sku: 'LAST-1', stock: 1 });

    const [o1, o2] = await Promise.all([
      api()
        .post('/api/v1/orders')
        .set(bearer(staff))
        .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: '25.00' }] })
        .expect(201),
      api()
        .post('/api/v1/orders')
        .set(bearer(staff))
        .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: '25.00' }] })
        .expect(201),
    ]);

    const [r1, r2] = await Promise.all([
      api().post(`/api/v1/orders/${o1.body.data.id}/confirm`).set(bearer(staff)),
      api().post(`/api/v1/orders/${o2.body.data.id}/confirm`).set(bearer(staff)),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 422]);

    const loser = r1.status === 422 ? r1 : r2;
    expect(loser.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(dbProd.stockQuantity).toBe(0);

    const saleMovements = await prisma.inventoryMovement.findMany({
      where: { productId: product.id, type: 'SALE' },
    });
    expect(saleMovements).toHaveLength(1);
    expect(saleMovements[0]!.quantityChange).toBe(-1);

    const confirmAudits = await prisma.auditLog.findMany({ where: { action: 'order.confirmed' } });
    expect(confirmAudits).toHaveLength(1);
  });

  it('2. Concurrent/repeated order confirmation: exactly one 200, stock deducted once', async () => {
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'Widget Repeat', sku: 'REP-C', stock: 10 });

    const createRes = await api()
      .post('/api/v1/orders')
      .set(bearer(staff))
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 3, unitPrice: '25.00' }] })
      .expect(201);
    const orderId = createRes.body.data.id;

    const [c1, c2] = await Promise.all([
      api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(staff)),
      api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(staff)),
    ]);

    expect([c1.status, c2.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const rejected = c1.status === 409 ? c1 : c2;
    expect(rejected.body.error.code).toBe('INVALID_STATE_TRANSITION');

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(dbProd.stockQuantity).toBe(7);

    const movements = await prisma.inventoryMovement.findMany({ where: { orderId, type: 'SALE' } });
    expect(movements).toHaveLength(1);
  });

  it('3. Concurrent/repeated order cancellation: stock restored once', async () => {
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'Widget Cancel', sku: 'REP-X', stock: 10 });

    const createRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 4, unitPrice: '25.00' }] })
      .expect(201);
    const orderId = createRes.body.data.id;
    await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(manager)).expect(200);

    const [x1, x2] = await Promise.all([
      api().post(`/api/v1/orders/${orderId}/cancel`).set(bearer(manager)).send({ reason: 'Changed mind' }),
      api().post(`/api/v1/orders/${orderId}/cancel`).set(bearer(manager)).send({ reason: 'Duplicate cancel' }),
    ]);

    expect([x1.status, x2.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(dbProd.stockQuantity).toBe(10);

    const cancelMovements = await prisma.inventoryMovement.findMany({
      where: { orderId, type: 'SALE_CANCELLATION' },
    });
    expect(cancelMovements).toHaveLength(1);
    expect(cancelMovements[0]!.quantityChange).toBe(4);
  });

  it('4. Concurrent purchase receiving: identical key replays safely; distinct keys never exceed ordered qty', async () => {
    const supplier = await makeSupplier();
    const product = await makeProduct({ name: 'Bulk Stock', sku: 'BULK-1', stock: 0 });

    const poRes = await api()
      .post('/api/v1/purchases')
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitCost: '12.00' }],
      })
      .expect(201);
    const purchaseId = poRes.body.data.id;
    const purchaseItemId = poRes.body.data.items[0].id;
    await api().post(`/api/v1/purchases/${purchaseId}/confirm`).set(bearer(manager)).expect(200);

    // 4a. Same Idempotency-Key fired concurrently -> replays cleanly, stock +6 once
    const sameKey = randomUUID();
    const [recA, recB] = await Promise.all([
      api()
        .post(`/api/v1/purchases/${purchaseId}/receipts`)
        .set(bearer(manager))
        .set('Idempotency-Key', sameKey)
        .send({ items: [{ purchaseItemId, quantity: 6 }] }),
      api()
        .post(`/api/v1/purchases/${purchaseId}/receipts`)
        .set(bearer(manager))
        .set('Idempotency-Key', sameKey)
        .send({ items: [{ purchaseItemId, quantity: 6 }] }),
    ]);
    expect([recA.status, recB.status].sort((a, b) => a - b)).toEqual([200, 201]);
    expect(recA.body.data.id).toBe(recB.body.data.id);

    // Reuse same key with different payload -> 422 IDEMPOTENCY_KEY_REUSED
    const mismatch = await api()
      .post(`/api/v1/purchases/${purchaseId}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', sameKey)
      .send({ items: [{ purchaseItemId, quantity: 4 }] });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    // 4b. Two distinct keys each asking for all 4 remaining units concurrently -> only one succeeds
    const [rem1, rem2] = await Promise.all([
      api()
        .post(`/api/v1/purchases/${purchaseId}/receipts`)
        .set(bearer(manager))
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ purchaseItemId, quantity: 4 }] }),
      api()
        .post(`/api/v1/purchases/${purchaseId}/receipts`)
        .set(bearer(manager))
        .set('Idempotency-Key', randomUUID())
        .send({ items: [{ purchaseItemId, quantity: 4 }] }),
    ]);

    const remStatuses = [rem1.status, rem2.status];
    expect(remStatuses.filter((s) => s === 201)).toHaveLength(1);
    const remLoser = rem1.status === 201 ? rem2 : rem1;
    expect([409, 422]).toContain(remLoser.status);

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(dbProd.stockQuantity).toBe(10);

    const poItem = await prisma.purchaseItem.findUniqueOrThrow({ where: { id: purchaseItemId } });
    expect(poItem.receivedQuantity).toBe(10);
  });

  it('5. Concurrent payments exceeding order balance: total paid never exceeds due; identical key replays', async () => {
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'Paid Item', sku: 'PAY-1', price: '100.00', stock: 10 });
    const methodId = await getActivePaymentMethodId();

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(staff))
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: '100.00' }] })
      .expect(201);
    const orderId = orderRes.body.data.id;
    await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(staff)).expect(200);

    // Concurrent distinct keys each paying 70 against 100 balance -> only one can succeed
    const [p1, p2] = await Promise.all([
      api()
        .post(`/api/v1/orders/${orderId}/payments`)
        .set(bearer(staff))
        .set('Idempotency-Key', randomUUID())
        .send({ paymentMethodId: methodId, amount: '70.00' }),
      api()
        .post(`/api/v1/orders/${orderId}/payments`)
        .set(bearer(staff))
        .set('Idempotency-Key', randomUUID())
        .send({ paymentMethodId: methodId, amount: '70.00' }),
    ]);

    expect([p1.status, p2.status].sort((a, b) => a - b)).toEqual([201, 422]);

    // Concurrent identical retries with same Idempotency-Key for remaining 30 -> replays cleanly
    const finalKey = randomUUID();
    const [f1, f2] = await Promise.all([
      api()
        .post(`/api/v1/orders/${orderId}/payments`)
        .set(bearer(staff))
        .set('Idempotency-Key', finalKey)
        .send({ paymentMethodId: methodId, amount: '30.00' }),
      api()
        .post(`/api/v1/orders/${orderId}/payments`)
        .set(bearer(staff))
        .set('Idempotency-Key', finalKey)
        .send({ paymentMethodId: methodId, amount: '30.00' }),
    ]);
    expect([f1.status, f2.status].sort((a, b) => a - b)).toEqual([200, 201]);

    const orderDb = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderDb.paidAmount.toFixed(2)).toBe('100.00');
    expect(orderDb.paymentStatus).toBe('PAID');
  });

  it('6. Concurrent return requests and completion: never exceed sold qty or restock twice', async () => {
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'Returnable', sku: 'RET-C', price: '50.00', stock: 10 });

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(staff))
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 3, unitPrice: '50.00' }] })
      .expect(201);
    const orderId = orderRes.body.data.id;
    const orderItemId = orderRes.body.data.items[0].id;

    await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(staff)).expect(200);
    await api().post(`/api/v1/orders/${orderId}/complete`).set(bearer(staff)).expect(200);

    // Concurrent create calls each requesting 2 of 3 sold units -> only one can create
    const [ret1, ret2] = await Promise.all([
      api()
        .post('/api/v1/sales-returns')
        .set(bearer(staff))
        .set('Idempotency-Key', randomUUID())
        .send({
          orderId,
          reason: 'Defective',
          items: [{ orderItemId, quantity: 2, condition: 'RESALABLE' }],
        }),
      api()
        .post('/api/v1/sales-returns')
        .set(bearer(staff))
        .set('Idempotency-Key', randomUUID())
        .send({
          orderId,
          reason: 'Defective',
          items: [{ orderItemId, quantity: 2, condition: 'RESALABLE' }],
        }),
    ]);

    expect([ret1.status, ret2.status].sort((a, b) => a - b)).toEqual([201, 422]);
    const createdReturn = ret1.status === 201 ? ret1.body.data : ret2.body.data;

    // Concurrent completion of that same pending return -> restocked strictly once!
    const [comp1, comp2] = await Promise.all([
      api().post(`/api/v1/sales-returns/${createdReturn.id}/complete`).set(bearer(manager)).send({}),
      api().post(`/api/v1/sales-returns/${createdReturn.id}/complete`).set(bearer(manager)).send({}),
    ]);
    expect([comp1.status, comp2.status].sort((a, b) => a - b)).toEqual([200, 409]);

    const dbProd = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    // Started with 10, sold 3 (=7), returned 2 (=9)
    expect(dbProd.stockQuantity).toBe(9);

    const restockMovements = await prisma.inventoryMovement.findMany({
      where: { salesReturnId: createdReturn.id, type: 'SALE_RETURN' },
    });
    expect(restockMovements).toHaveLength(1);
    expect(restockMovements[0]!.quantityChange).toBe(2);
  });

  it('7. Unauthorized and forbidden users are blocked across restricted domain endpoints', async () => {
    const supplier = await makeSupplier();
    const customer = await makeCustomer();
    const product = await makeProduct({ name: 'RBAC Prod', sku: 'RBAC-1', stock: 5 });

    // Create & confirm an order as manager
    const ordRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({ customerId: customer.id, items: [{ productId: product.id, quantity: 1, unitPrice: '25.00' }] })
      .expect(201);
    const orderId = ordRes.body.data.id;
    await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(manager)).expect(200);

    // Unauthenticated rejected
    await api().get('/api/v1/orders').expect(401);
    await api().get('/api/v1/settings').expect(401);

    // STAFF lacks purchases, adjustments, confirmed cancel, discount, refunds, reports, audit logs, roles, settings update
    const forbiddenChecks = await Promise.all([
      api().post('/api/v1/purchases').set(bearer(staff)).send({ supplierId: supplier.id, items: [{ productId: product.id, quantity: 1, unitCost: '5.00' }] }),
      api().post('/api/v1/inventory/adjustments').set(bearer(staff)).set('Idempotency-Key', randomUUID()).send({ productId: product.id, direction: 'IN', quantity: 1, reason: 'FOUND' }),
      api().post(`/api/v1/orders/${orderId}/cancel`).set(bearer(staff)).send({ reason: 'Unauthorized' }),
      api().post('/api/v1/orders').set(bearer(staff)).send({ customerId: customer.id, discountType: 'FIXED', discountValue: '5', items: [{ productId: product.id, quantity: 1, unitPrice: '25.00' }] }),
      api().post(`/api/v1/orders/${orderId}/refunds`).set(bearer(staff)).set('Idempotency-Key', randomUUID()).send({ paymentMethodId: await getActivePaymentMethodId(), amount: '1.00' }),
      api().get('/api/v1/reports/financial/summary').set(bearer(staff)),
      api().get('/api/v1/audit-logs').set(bearer(staff)),
      api().get('/api/v1/roles').set(bearer(staff)),
      api().patch('/api/v1/settings').set(bearer(staff)).send({ taxLabel: 'VAT' }),
    ]);

    for (const res of forbiddenChecks) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('8. Transaction rollback on multi-line confirm failure: zero partial stock deduction, movements, or audit', async () => {
    const customer = await makeCustomer();
    const okProduct = await makeProduct({ name: 'In Stock Line', sku: 'RB-OK', stock: 10 });
    const shortProduct = await makeProduct({ name: 'Short Line', sku: 'RB-SHORT', stock: 1 });

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [
          { productId: okProduct.id, quantity: 5, unitPrice: '25.00' },
          { productId: shortProduct.id, quantity: 4, unitPrice: '25.00' },
        ],
      })
      .expect(201);
    const orderId = orderRes.body.data.id;

    const confirmRes = await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(manager));
    expect(confirmRes.status).toBe(422);
    expect(confirmRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');

    const [p1, p2, orderDb, movements, confirmAudits] = await Promise.all([
      prisma.product.findUniqueOrThrow({ where: { id: okProduct.id } }),
      prisma.product.findUniqueOrThrow({ where: { id: shortProduct.id } }),
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.inventoryMovement.findMany({ where: { orderId } }),
      prisma.auditLog.findMany({ where: { entityId: orderId, action: 'order.confirmed' } }),
    ]);

    expect(p1.stockQuantity).toBe(10);
    expect(p2.stockQuantity).toBe(1);
    expect(orderDb.status).toBe('DRAFT');
    expect(orderDb.invoiceNumber).toBeNull();
    expect(movements).toHaveLength(0);
    expect(confirmAudits).toHaveLength(0);
  });
});
