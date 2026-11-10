import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/sales-returns';

let manager: Session;
let staff: Session;

const makeCustomer = (name: string) =>
  prisma.customer.create({ data: { name, phone: '1234567890', address: '123 Street' } });

const makeProduct = (
  name: string,
  sku: string,
  costPrice: string,
  sellingPrice: string,
  stockQuantity = 50,
) =>
  prisma.product.create({
    data: {
      name,
      sku,
      unit: 'pcs',
      costPrice,
      sellingPrice,
      stockQuantity,
      status: 'ACTIVE',
    },
  });

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
  staff = await loginAs('STAFF');
});

describe('Sales Returns Module (Phase 6)', () => {
  async function createDeliveredOrder() {
    const customer = await makeCustomer('Alice Smith');
    const p1 = await makeProduct('Product One', 'P-ONE', '10.00', '25.00', 100);
    const p2 = await makeProduct('Product Two', 'P-TWO', '20.00', '50.00', 100);

    // 1. Create order
    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(staff))
      .send({
        customerId: customer.id,
        items: [
          { productId: p1.id, quantity: 4, unitPrice: '25.00' },
          { productId: p2.id, quantity: 2, unitPrice: '50.00' },
        ],
      })
      .expect(201);

    const orderId = orderRes.body.data.id;

    // 2. Confirm order (deducts stock)
    await api()
      .post(`/api/v1/orders/${orderId}/confirm`)
      .set(bearer(staff))
      .expect(200);

    // 3. Ship order
    await api()
      .post(`/api/v1/orders/${orderId}/ship`)
      .set(bearer(staff))
      .send({ carrier: 'DHL', trackingNumber: 'TRK-123' })
      .expect(200);

    // 4. Deliver order
    const deliveredRes = await api()
      .post(`/api/v1/orders/${orderId}/deliver`)
      .set(bearer(staff))
      .expect(200);

    return {
      order: deliveredRes.body.data,
      customer,
      p1,
      p2,
    };
  }

  it('creates a return request against a delivered order (BR-RET-01, BR-RET-02)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0];

    const res = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-ret-001')
      .send({
        orderId: order.id,
        reason: 'Customer changed mind',
        items: [
          {
            orderItemId: item1.id,
            quantity: 2,
            condition: 'RESALABLE',
          },
        ],
      })
      .expect(201);

    expect(res.body.data.returnNumber).toMatch(/^RET-\d{6}$/);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.subtotal).toBe('50.00'); // 2 * 25.00
    expect(res.body.data.totalAmount).toBe('50.00');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.items[0].condition).toBe('RESALABLE');
  });

  it('replays return creation with same idempotency key, rejects different payload (BR-IDEM-01)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0];

    const payload = {
      orderId: order.id,
      reason: 'Wrong size',
      items: [{ orderItemId: item1.id, quantity: 1, condition: 'RESALABLE' as const }],
    };

    const first = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-ret-replay')
      .send(payload)
      .expect(201);

    const replayed = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-ret-replay')
      .send(payload)
      .expect(200);

    expect(replayed.headers['idempotent-replayed']).toBe('true');
    expect(replayed.body.data.id).toBe(first.body.data.id);

    // Mismatched payload
    const conflictRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-ret-replay')
      .send({ ...payload, reason: 'Different reason' })
      .expect(409);

    expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects return creation on draft or confirmed (not delivered/completed) orders', async () => {
    const customer = await makeCustomer('Bob');
    const p1 = await makeProduct('Product A', 'PA', '10.00', '20.00', 50);

    const draftRes = await api()
      .post('/api/v1/orders')
      .set(bearer(staff))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 1, unitPrice: '20.00' }],
      })
      .expect(201);

    const draftOrder = draftRes.body.data;

    await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-draft-ret')
      .send({
        orderId: draftOrder.id,
        reason: 'Too early',
        items: [{ orderItemId: draftOrder.items[0].id, quantity: 1, condition: 'RESALABLE' }],
      })
      .expect(409);
  });

  it('rejects return quantity exceeding order line quantity minus pending/completed returns (BR-RET-02)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0]; // quantity = 4

    // Return 3 items
    await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-part-1')
      .send({
        orderId: order.id,
        reason: 'First batch',
        items: [{ orderItemId: item1.id, quantity: 3, condition: 'RESALABLE' }],
      })
      .expect(201);

    // Attempting to return 2 more (3 + 2 = 5 > 4) must fail with 422
    const failRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-part-2')
      .send({
        orderId: order.id,
        reason: 'Second batch exceeds',
        items: [{ orderItemId: item1.id, quantity: 2, condition: 'RESALABLE' }],
      })
      .expect(422);

    expect(failRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('handles rejection with mandatory reason (FR-RET-04)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0];

    const createRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-reject-me')
      .send({
        orderId: order.id,
        reason: 'Defective item',
        items: [{ orderItemId: item1.id, quantity: 1, condition: 'DAMAGED' }],
      })
      .expect(201);

    const returnId = createRes.body.data.id;

    // Reject without reason fails validation
    await api()
      .post(`${BASE}/${returnId}/reject`)
      .set(bearer(manager))
      .send({ reason: '' })
      .expect(422);

    // Reject with reason succeeds
    const rejectRes = await api()
      .post(`${BASE}/${returnId}/reject`)
      .set(bearer(manager))
      .send({ reason: 'Item was damaged by customer misuse' })
      .expect(200);

    expect(rejectRes.body.data.status).toBe('REJECTED');
    expect(rejectRes.body.data.rejectionReason).toBe('Item was damaged by customer misuse');
    expect(rejectRes.body.data.processedAt).not.toBeNull();

    // Cannot reject again
    await api()
      .post(`${BASE}/${returnId}/reject`)
      .set(bearer(manager))
      .send({ reason: 'Try again' })
      .expect(409);
  });

  it('completes return: restores stock for RESALABLE, skips DAMAGED, updates order returnedAmount (BR-RET-03, 05)', async () => {
    const { order, p1, p2 } = await createDeliveredOrder();
    // p1 initial stock: 100 - 4 = 96
    // p2 initial stock: 100 - 2 = 98

    const stockP1Before = await prisma.product.findUnique({ where: { id: p1.id } });
    const stockP2Before = await prisma.product.findUnique({ where: { id: p2.id } });
    expect(stockP1Before!.stockQuantity).toBe(96);
    expect(stockP2Before!.stockQuantity).toBe(98);

    const item1 = order.items[0]; // Product One, qty 4, 25.00 ea
    const item2 = order.items[1]; // Product Two, qty 2, 50.00 ea

    // Return: 2 RESALABLE of item1, 1 DAMAGED of item2
    const createRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-complete-test')
      .send({
        orderId: order.id,
        reason: 'Mixed return',
        items: [
          { orderItemId: item1.id, quantity: 2, condition: 'RESALABLE' },
          { orderItemId: item2.id, quantity: 1, condition: 'DAMAGED' },
        ],
      })
      .expect(201);

    const returnId = createRes.body.data.id;

    // Complete return
    const completeRes = await api()
      .post(`${BASE}/${returnId}/complete`)
      .set(bearer(manager))
      .send({ notes: 'Inspected and verified' })
      .expect(200);

    expect(completeRes.body.data.status).toBe('COMPLETED');
    expect(completeRes.body.data.totalAmount).toBe('100.00'); // (2 * 25) + (1 * 50)

    // Verify inventory: p1 restocked by 2 (96 -> 98), p2 not restocked (still 98)
    const stockP1After = await prisma.product.findUnique({ where: { id: p1.id } });
    const stockP2After = await prisma.product.findUnique({ where: { id: p2.id } });
    expect(stockP1After!.stockQuantity).toBe(98);
    expect(stockP2After!.stockQuantity).toBe(98);

    // Verify inventory_movements ledger has exactly 1 SALE_RETURN movement for p1
    const movements = await prisma.inventoryMovement.findMany({
      where: { salesReturnId: returnId },
    });
    expect(movements).toHaveLength(1);
    expect(movements[0]!.productId).toBe(p1.id);
    expect(movements[0]!.type).toBe('SALE_RETURN');
    expect(movements[0]!.quantityChange).toBe(2);

    // Verify order.returnedAmount is updated
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.returnedAmount.toString()).toBe('100');
  });

  it('generates refund linked to sales return and updates order balances (BR-RET-06, BR-PAY-04)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0];

    // First pay for the order in full ($200.00)
    const method = await prisma.paymentMethod.findFirstOrThrow({ where: { code: 'CASH' } });
    await api()
      .post(`/api/v1/orders/${order.id}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-pay-full')
      .send({
        paymentMethodId: method.id,
        amount: '200.00',
      })
      .expect(201);

    // Return 2 units of item1 ($50.00)
    const retRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-ret-for-refund')
      .send({
        orderId: order.id,
        reason: 'Refund needed',
        items: [{ orderItemId: item1.id, quantity: 2, condition: 'RESALABLE' }],
      })
      .expect(201);

    const returnId = retRes.body.data.id;

    // Must be completed before refund
    await api()
      .post(`${BASE}/${returnId}/refund`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-early-refund')
      .send({ paymentMethodId: method.id })
      .expect(409);

    // Complete the return
    await api()
      .post(`${BASE}/${returnId}/complete`)
      .set(bearer(manager))
      .send({})
      .expect(200);

    // Now issue refund via POST /sales-returns/:id/refund (with omitted amount to auto-calculate)
    const refundRes = await api()
      .post(`${BASE}/${returnId}/refund`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-return-refund')
      .send({
        paymentMethodId: method.id,
      })
      .expect(201);

    expect(refundRes.body.data.type).toBe('REFUND');
    expect(refundRes.body.data.amount).toBe('50.00');
    expect(refundRes.body.data.salesReturnId).toBe(returnId);

    // Replay refund with same idempotency key and omitted amount
    const replayedRefund = await api()
      .post(`${BASE}/${returnId}/refund`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-return-refund')
      .send({
        paymentMethodId: method.id,
      })
      .expect(200);

    expect(replayedRefund.headers['idempotent-replayed']).toBe('true');
    expect(replayedRefund.body.data.id).toBe(refundRes.body.data.id);

    // Check order refundedAmount updated
    const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(finalOrder!.refundedAmount.toString()).toBe('50');
    expect(finalOrder!.paymentStatus).toBe('PARTIALLY_REFUNDED');
  });

  it('lists sales returns with filtering and pagination (FR-RET-06)', async () => {
    const { order } = await createDeliveredOrder();
    const item1 = order.items[0];

    await api()
      .post(BASE)
      .set(bearer(staff))
      .set('Idempotency-Key', 'idem-list-1')
      .send({
        orderId: order.id,
        reason: 'Filter search test',
        items: [{ orderItemId: item1.id, quantity: 1, condition: 'RESALABLE' }],
      })
      .expect(201);

    const listRes = await api()
      .get(BASE)
      .set(bearer(staff))
      .query({ search: 'Filter search', status: 'PENDING' })
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].orderId).toBe(order.id);
  });
});
