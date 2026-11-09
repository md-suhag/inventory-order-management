import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/purchases';

let manager: Session;
let staff: Session;

const makeSupplier = (name: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') =>
  prisma.supplier.create({ data: { name, status } });

const makeProduct = (name: string, sku: string, costPrice: string, sellingPrice: string, stockQuantity = 0, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') =>
  prisma.product.create({
    data: {
      name,
      sku,
      costPrice,
      sellingPrice,
      stockQuantity,
      status,
    },
  });

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
  staff = await loginAs('STAFF');
});

describe('Purchases CRUD and State Machine', () => {
  it('creates a draft purchase with server calculations and snapshots', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');
    const p2 = await makeProduct('Widget B', 'WGT-B', '20.00', '30.00');

    const res = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        supplierReference: 'INV-1234',
        expectedDeliveryDate: '2026-12-01',
        notes: 'Urgent order',
        discountType: 'PERCENTAGE',
        discountValue: '10',
        items: [
          { productId: p1.id, quantity: 10, unitCost: '10.00', discountAmount: '0' },
          { productId: p2.id, quantity: 5, unitCost: '20.00', discountAmount: '0' },
        ],
      })
      .expect(201);

    const purchase = res.body.data;
    expect(purchase.purchaseNumber).toMatch(/^PO-\d{6}$/);
    expect(purchase.status).toBe('DRAFT');
    expect(purchase.paymentStatus).toBe('UNPAID');
    expect(purchase.subtotal).toBe('200.00');
    expect(purchase.discountAmount).toBe('20.00');
    expect(purchase.totalAmount).toBe('180.00');
    expect(purchase.balanceDue).toBe('180.00');
    expect(purchase.items).toHaveLength(2);
    expect(purchase.items[0].productName).toBe('Widget A');
    expect(purchase.items[0].productSku).toBe('WGT-A');
    expect(purchase.items[0].remainingQuantity).toBe(10);
  });

  it('rejects duplicate products in items (BR-CALC-11)', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');

    const res = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [
          { productId: p1.id, quantity: 5, unitCost: '10.00' },
          { productId: p1.id, quantity: 10, unitCost: '10.00' },
        ],
      })
      .expect(422);

    expect(res.body.error.message).toMatch(/appear only once/i);
  });

  it('rejects inactive supplier and inactive products (BR-PUR-02)', async () => {
    const archivedSupplier = await makeSupplier('Old Supplier', 'ARCHIVED');
    const activeSupplier = await makeSupplier('Active Supplier');
    const activeProduct = await makeProduct('Product 1', 'P-1', '10.00', '15.00');
    const archivedProduct = await makeProduct('Archived Product', 'P-2', '10.00', '15.00', 0, 'ARCHIVED');

    await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: archivedSupplier.id,
        items: [{ productId: activeProduct.id, quantity: 1, unitCost: '10.00' }],
      })
      .expect(422);

    await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: activeSupplier.id,
        items: [{ productId: archivedProduct.id, quantity: 1, unitCost: '10.00' }],
      })
      .expect(422);
  });

  it('STAFF cannot manage purchases without permission', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');

    await api()
      .post(BASE)
      .set(bearer(staff))
      .send({
        supplierId: supplier.id,
        items: [{ productId: p1.id, quantity: 1, unitCost: '10.00' }],
      })
      .expect(403);
  });

  it('updates a draft purchase and recalculates totals', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');

    const created = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: p1.id, quantity: 2, unitCost: '10.00' }],
      })
      .expect(201);

    const updated = await api()
      .patch(`${BASE}/${created.body.data.id}`)
      .set(bearer(manager))
      .send({
        notes: 'Updated notes',
        items: [{ productId: p1.id, quantity: 5, unitCost: '10.00' }],
      })
      .expect(200);

    expect(updated.body.data.notes).toBe('Updated notes');
    expect(updated.body.data.totalAmount).toBe('50.00');
  });

  it('confirms a draft purchase (DRAFT -> ORDERED) and lines become read-only', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');

    const created = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: p1.id, quantity: 5, unitCost: '10.00' }],
      })
      .expect(201);

    const confirmed = await api()
      .post(`${BASE}/${created.body.data.id}/confirm`)
      .set(bearer(manager))
      .expect(200);

    expect(confirmed.body.data.status).toBe('ORDERED');
    expect(confirmed.body.data.orderedAt).toBeTruthy();

    // Confirming again returns 409
    await api()
      .post(`${BASE}/${created.body.data.id}/confirm`)
      .set(bearer(manager))
      .expect(409);

    // Editing non-draft returns 409
    await api()
      .patch(`${BASE}/${created.body.data.id}`)
      .set(bearer(manager))
      .send({ notes: 'Illegal edit' })
      .expect(409);

    // Deleting non-draft returns 409
    await api()
      .delete(`${BASE}/${created.body.data.id}`)
      .set(bearer(manager))
      .expect(409);
  });

  it('cancels a DRAFT or ORDERED purchase', async () => {
    const supplier = await makeSupplier('Acme Ltd');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '15.00');

    const draft = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: p1.id, quantity: 2, unitCost: '10.00' }],
      })
      .expect(201);

    const cancelled = await api()
      .post(`${BASE}/${draft.body.data.id}/cancel`)
      .set(bearer(manager))
      .expect(200);

    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.cancelledAt).toBeTruthy();
  });
});

describe('Goods Receiving & Stock Updates (BR-PUR-03, 04, 07, BR-INV-05)', () => {
  it('receives goods partially then fully, blending weighted-average cost', async () => {
    const supplier = await makeSupplier('Steel Corp');
    // Start with 10 items at $10.00 cost price
    const prod = await makeProduct('Steel Rod', 'ROD-01', '10.00', '20.00', 10);

    const purchaseRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: prod.id, quantity: 20, unitCost: '16.00' }],
      })
      .expect(201);

    const purchaseId = purchaseRes.body.data.id;
    const purchaseItemId = purchaseRes.body.data.items[0].id;

    // Confirm purchase
    await api().post(`${BASE}/${purchaseId}/confirm`).set(bearer(manager)).expect(200);

    // 1. Partial receipt: receive 10 units with Idempotency-Key
    // Previous stock = 10 @ $10.00. Inbound: 10 @ $16.00.
    // New WAC = (10*10 + 10*16) / 20 = 260 / 20 = $13.0000
    const receiptKey1 = 'key-receipt-001';
    const rec1 = await api()
      .post(`${BASE}/${purchaseId}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', receiptKey1)
      .send({
        notes: 'First batch delivered',
        items: [{ purchaseItemId, quantity: 10 }],
      })
      .expect(201);

    expect(rec1.body.data.receiptNumber).toMatch(/^GRN-\d{6}$/);
    expect(rec1.body.data.items[0].quantity).toBe(10);
    expect(rec1.body.data.items[0].unitCost).toBe('16.0000');

    // Verify purchase status is now PARTIALLY_RECEIVED
    const pAfterRec1 = await api().get(`${BASE}/${purchaseId}`).set(bearer(manager)).expect(200);
    expect(pAfterRec1.body.data.status).toBe('PARTIALLY_RECEIVED');
    expect(pAfterRec1.body.data.items[0].receivedQuantity).toBe(10);
    expect(pAfterRec1.body.data.items[0].remainingQuantity).toBe(10);

    // Verify product stock & cost updated
    const updatedProd1 = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(updatedProd1!.stockQuantity).toBe(20);
    expect(updatedProd1!.costPrice.toString()).toBe('13');

    // 2. Replay receipt with same Idempotency-Key -> returns original response without extra movement
    const replay = await api()
      .post(`${BASE}/${purchaseId}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', receiptKey1)
      .send({
        notes: 'First batch delivered',
        items: [{ purchaseItemId, quantity: 10 }],
      })
      .expect(200);

    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.data.id).toBe(rec1.body.data.id);

    // Stock must not have changed on replay
    const prodAfterReplay = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(prodAfterReplay!.stockQuantity).toBe(20);

    // 3. Over-receiving is rejected (BR-PUR-03)
    await api()
      .post(`${BASE}/${purchaseId}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'key-over-receive')
      .send({
        items: [{ purchaseItemId, quantity: 15 }], // only 10 remaining
      })
      .expect(422);

    // 4. Receive remainder (10 units) -> purchase transitions to RECEIVED
    const rec2 = await api()
      .post(`${BASE}/${purchaseId}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'key-receipt-002')
      .send({
        items: [{ purchaseItemId, quantity: 10 }],
      })
      .expect(201);

    expect(rec2.body.data.items[0].quantity).toBe(10);

    const finalPurchase = await api().get(`${BASE}/${purchaseId}`).set(bearer(manager)).expect(200);
    expect(finalPurchase.body.data.status).toBe('RECEIVED');
    expect(finalPurchase.body.data.receivedAt).toBeTruthy();

    const finalProd = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(finalProd!.stockQuantity).toBe(30);

    // 5. Trying to cancel a received/partially received purchase is forbidden (BR-PUR-05)
    await api().post(`${BASE}/${purchaseId}/cancel`).set(bearer(manager)).expect(409);

    // 6. List receipts for purchase
    const receiptsList = await api().get(`${BASE}/${purchaseId}/receipts`).set(bearer(manager)).expect(200);
    expect(receiptsList.body.data).toHaveLength(2);
    expect(receiptsList.body.data[0].receiptNumber).toMatch(/^GRN-\d{6}$/);

    // 7. List purchases
    const listRes = await api().get(BASE).set(bearer(manager)).expect(200);
    expect(listRes.body.meta.total).toBe(1);
    expect(listRes.body.data[0].id).toBe(purchaseId);
    expect(listRes.body.data[0].status).toBe('RECEIVED');
    expect(listRes.body.data[0].supplierName).toBe('Steel Corp');
  });
});
