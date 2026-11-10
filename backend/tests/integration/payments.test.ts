import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const ORDERS_BASE = '/api/v1/orders';
const PAYMENTS_BASE = '/api/v1/payments';

let manager: Session;
let staff: Session;

const makeCustomer = (name: string) =>
  prisma.customer.create({ data: { name, phone: '1234567890' } });

const makeProduct = (name: string, sku: string, sellingPrice: string, stockQuantity = 100) =>
  prisma.product.create({
    data: {
      name,
      sku,
      unit: 'pcs',
      costPrice: '10.00',
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

describe('Payments Module (Phase 5)', () => {
  async function createConfirmedOrder(total = '100.00') {
    const customer = await makeCustomer('Test Customer');
    const product = await makeProduct('Product X', `SKU-${Date.now()}`, total, 100);

    const createRes = await api()
      .post(ORDERS_BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: total }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;
    await api().post(`${ORDERS_BASE}/${orderId}/confirm`).set(bearer(manager)).expect(200);

    return orderId;
  }

  it('records payment, validates method, rejects overpayment, updates paidAmount & paymentStatus (BR-PAY-01..03)', async () => {
    const orderId = await createConfirmedOrder('100.00');

    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    // 1. Partial payment (40.00)
    const key1 = randomUUID();
    const pay1 = await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', key1)
      .send({
        paymentMethodId: cashMethod.id,
        amount: '40.00',
        reference: 'RCP-001',
      })
      .expect(201);

    expect(pay1.body.data.paymentNumber).toMatch(/^PAY-\d{6}$/);
    expect(pay1.body.data.type).toBe('PAYMENT');
    expect(pay1.body.data.amount).toBe('40.00');

    // Verify order updated
    let order = await api().get(`${ORDERS_BASE}/${orderId}`).set(bearer(manager)).expect(200);
    expect(order.body.data.paidAmount).toBe('40.00');
    expect(order.body.data.balanceDue).toBe('60.00');
    expect(order.body.data.paymentStatus).toBe('PARTIALLY_PAID');

    // 2. Reject overpayment (balance is 60.00, attempting 60.01) (BR-PAY-03)
    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethodId: cashMethod.id,
        amount: '60.01',
      })
      .expect(422);

    // 3. Complete payment (60.00) -> transitions paymentStatus to PAID
    const key2 = randomUUID();
    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', key2)
      .send({
        paymentMethodId: cashMethod.id,
        amount: '60.00',
      })
      .expect(201);

    order = await api().get(`${ORDERS_BASE}/${orderId}`).set(bearer(manager)).expect(200);
    expect(order.body.data.paidAmount).toBe('100.00');
    expect(order.body.data.balanceDue).toBe('0.00');
    expect(order.body.data.paymentStatus).toBe('PAID');
  });

  it('supports idempotency replay on payment requests (BR-IDEM-01)', async () => {
    const orderId = await createConfirmedOrder('50.00');
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });
    const key = randomUUID();

    // First request creates payment
    const res1 = await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', key)
      .send({
        paymentMethodId: cashMethod.id,
        amount: '20.00',
      })
      .expect(201);

    // Second request with same key and payload returns 200 with Idempotent-Replayed
    const res2 = await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', key)
      .send({
        paymentMethodId: cashMethod.id,
        amount: '20.00',
      })
      .expect(200);

    expect(res2.headers['idempotent-replayed']).toBe('true');
    expect(res2.body.data.id).toBe(res1.body.data.id);

    // Same key with different payload returns 409 IDEMPOTENCY_KEY_REUSED
    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', key)
      .send({
        paymentMethodId: cashMethod.id,
        amount: '30.00',
      })
      .expect(409);
  });

  it('rejects payments with deactivated payment methods (BR-PAY-10)', async () => {
    const orderId = await createConfirmedOrder('50.00');
    const inactiveMethod = await prisma.paymentMethod.create({
      data: { code: 'OBSOLETE', name: 'Obsolete Method', isActive: false },
    });

    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({
        paymentMethodId: inactiveMethod.id,
        amount: '20.00',
      })
      .expect(422);
  });

  it('refunds customer on cancelled orders up to paid amount (BR-PAY-04)', async () => {
    const orderId = await createConfirmedOrder('100.00');
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    // Pay 50.00
    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '50.00' })
      .expect(201);

    // Active order without credit cannot be refunded (balance due is +50.00)
    await api()
      .post(`${ORDERS_BASE}/${orderId}/refunds`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '10.00' })
      .expect(422);

    // Order cancellation is rejected while it has non-refunded payments
    await api().post(`${ORDERS_BASE}/${orderId}/cancel`).set(bearer(manager)).expect(422);

    // We can cancel order if we restore stock, but let's test refund on cancelled order by setting status or testing refund
    // Wait, let's mark order cancelled in test to test post-cancellation refunds
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    });

    // Now order is CANCELLED, netPaid is 50.00. Attempting to refund 60.00 is rejected (exceeds paid amount)
    await api()
      .post(`${ORDERS_BASE}/${orderId}/refunds`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '60.00' })
      .expect(422);

    // Partial refund (20.00)
    const ref1 = await api()
      .post(`${ORDERS_BASE}/${orderId}/refunds`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '20.00' })
      .expect(201);

    expect(ref1.body.data.type).toBe('REFUND');
    expect(ref1.body.data.amount).toBe('20.00');

    let order = await api().get(`${ORDERS_BASE}/${orderId}`).set(bearer(manager)).expect(200);
    expect(order.body.data.refundedAmount).toBe('20.00');
    expect(order.body.data.paymentStatus).toBe('PARTIALLY_REFUNDED');

    // Remaining refund (30.00)
    await api()
      .post(`${ORDERS_BASE}/${orderId}/refunds`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '30.00' })
      .expect(201);

    order = await api().get(`${ORDERS_BASE}/${orderId}`).set(bearer(manager)).expect(200);
    expect(order.body.data.refundedAmount).toBe('50.00');
    expect(order.body.data.paymentStatus).toBe('REFUNDED');
  });

  it('reverses an erroneous payment and adjusts order balance (BR-PAY-05)', async () => {
    const orderId = await createConfirmedOrder('100.00');
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    // Pay 50.00
    const payRes = await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '50.00' })
      .expect(201);

    const paymentId = payRes.body.data.id;

    // Reverse the payment
    const revKey = randomUUID();
    const revRes = await api()
      .post(`${PAYMENTS_BASE}/${paymentId}/reverse`)
      .set(bearer(manager))
      .set('Idempotency-Key', revKey)
      .send({ reason: 'Accidental duplicate entry by cashier' })
      .expect(201);

    expect(revRes.body.data.type).toBe('REVERSAL');
    expect(revRes.body.data.amount).toBe('50.00');
    expect(revRes.body.data.reversedPaymentId).toBe(paymentId);
    expect(revRes.body.data.notes).toBe('Accidental duplicate entry by cashier');

    // Order balance restored to 100.00 unpaid
    const order = await api().get(`${ORDERS_BASE}/${orderId}`).set(bearer(manager)).expect(200);
    expect(order.body.data.paidAmount).toBe('0.00');
    expect(order.body.data.balanceDue).toBe('100.00');
    expect(order.body.data.paymentStatus).toBe('UNPAID');

    // Reversing again returns 409
    await api()
      .post(`${PAYMENTS_BASE}/${paymentId}/reverse`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Reversing again' })
      .expect(409);

    // Reversing a reversal returns 409
    await api()
      .post(`${PAYMENTS_BASE}/${revRes.body.data.id}/reverse`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Reverse reversal' })
      .expect(409);
  });

  it('lists payments for an order: GET /orders/:id/payments', async () => {
    const orderId = await createConfirmedOrder('80.00');
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '30.00' })
      .expect(201);

    const res = await api().get(`${ORDERS_BASE}/${orderId}/payments`).set(bearer(manager)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].amount).toBe('30.00');
    expect(res.body.data[0].paymentMethod.code).toBe('CASH');
  });

  it('lists all payments with pagination: GET /payments', async () => {
    const orderId = await createConfirmedOrder('80.00');
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    await api()
      .post(`${ORDERS_BASE}/${orderId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '25.00' })
      .expect(201);

    const res = await api().get(PAYMENTS_BASE).set(bearer(manager)).query({ type: 'PAYMENT' }).expect(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta).toHaveProperty('total');
  });

  it('records supplier payments, rejects overpayment/STAFF role, supports refund after cancel & reversal (FR-PUR-07, BR-PAY-02..07)', async () => {
    const supplier = await prisma.supplier.create({ data: { name: 'Pay Vendor', phone: '555-2000' } });
    const product = await makeProduct('Vendor Stock', `VND-${Date.now()}`, '25.00', 0);
    const cashMethod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CASH' } });

    const createPur = await api()
      .post('/api/v1/purchases')
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: product.id, quantity: 10, unitCost: '10.00' }],
      })
      .expect(201);
    const purchaseId = createPur.body.data.id;

    // Draft purchase rejects payment
    await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '50.00' })
      .expect(409);

    await api().post(`/api/v1/purchases/${purchaseId}/confirm`).set(bearer(manager)).expect(200);

    // STAFF lacks payments.record_supplier permission
    await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(staff))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '40.00' })
      .expect(403);

    // Advance payment on ORDERED purchase (40.00 of 100.00) + idempotent replay
    const payKey = randomUUID();
    const p1 = await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', payKey)
      .send({ paymentMethodId: cashMethod.id, amount: '40.00', reference: 'SUP-ADV-1' })
      .expect(201);
    expect(p1.body.data.purchaseId).toBe(purchaseId);

    const p1Replay = await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', payKey)
      .send({ paymentMethodId: cashMethod.id, amount: '40.00', reference: 'SUP-ADV-1' })
      .expect(200);
    expect(p1Replay.headers['idempotent-replayed']).toBe('true');
    expect(p1Replay.body.data.id).toBe(p1.body.data.id);

    // Overpayment rejected (> 60.00 remaining)
    await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '60.01' })
      .expect(422);

    // Reversing advance payment restores balance to 100.00 UNPAID
    await api()
      .post(`${PAYMENTS_BASE}/${p1.body.data.id}/reverse`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'Wrong vendor bank account' })
      .expect(201);

    let pur = await api().get(`/api/v1/purchases/${purchaseId}`).set(bearer(manager)).expect(200);
    expect(pur.body.data.balanceDue).toBe('100.00');
    expect(pur.body.data.paymentStatus).toBe('UNPAID');

    // Pay 50.00, cancel purchase (0 receipts), then record supplier refund of 50.00
    await api()
      .post(`/api/v1/purchases/${purchaseId}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '50.00' })
      .expect(201);

    await api().post(`/api/v1/purchases/${purchaseId}/cancel`).set(bearer(manager)).expect(200);

    await api()
      .post(`/api/v1/purchases/${purchaseId}/refunds`)
      .set(bearer(manager))
      .set('Idempotency-Key', randomUUID())
      .send({ paymentMethodId: cashMethod.id, amount: '50.00', reference: 'SUP-REF-1' })
      .expect(201);

    pur = await api().get(`/api/v1/purchases/${purchaseId}`).set(bearer(manager)).expect(200);
    expect(pur.body.data.paymentStatus).toBe('REFUNDED');
    expect(pur.body.data.balanceDue).toBe('0.00');

    const listRes = await api().get(`/api/v1/purchases/${purchaseId}/payments`).set(bearer(manager)).expect(200);
    expect(listRes.body.data).toHaveLength(4); // PAY-1, REVERSAL, PAY-2, REFUND
  });
});
