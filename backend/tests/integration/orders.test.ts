import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/orders';

let manager: Session;
let staff: Session;

const makeCustomer = (name: string, status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE') =>
  prisma.customer.create({ data: { name, phone: '1234567890', address: '123 Street', status } });

const makeProduct = (
  name: string,
  sku: string,
  costPrice: string,
  sellingPrice: string,
  stockQuantity = 0,
  status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE',
) =>
  prisma.product.create({
    data: {
      name,
      sku,
      unit: 'pcs',
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

describe('Orders Module (Phase 5)', () => {
  it('creates a draft order with line calculations and snapshots (BR-ORD-01, BR-SNAP-01, 02)', async () => {
    const customer = await makeCustomer('John Doe');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 50);
    const p2 = await makeProduct('Widget B', 'WGT-B', '15.00', '30.00', 30);

    const res = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        notes: 'Test order',
        discountType: 'PERCENTAGE',
        discountValue: '10',
        items: [
          { productId: p1.id, quantity: 2, unitPrice: '20.00', discountAmount: '0' },
          { productId: p2.id, quantity: 1, unitPrice: '30.00', discountAmount: '0' },
        ],
      })
      .expect(201);

    const order = res.body.data;
    expect(order.orderNumber).toMatch(/^SO-\d{6}$/);
    expect(order.status).toBe('DRAFT');
    expect(order.paymentStatus).toBe('UNPAID');
    expect(order.invoiceNumber).toBeNull();
    expect(order.customerName).toBe('John Doe');
    expect(order.customerPhone).toBe('1234567890');
    expect(order.customerAddress).toBe('123 Street');
    // subtotal: 2*20 + 1*30 = 70.00; discount 10% = 7.00; total = 63.00
    expect(order.subtotal).toBe('70.00');
    expect(order.discountAmount).toBe('7.00');
    expect(order.totalAmount).toBe('63.00');
    expect(order.balanceDue).toBe('63.00');
    expect(order.items).toHaveLength(2);
    expect(order.items[0]).toMatchObject({
      productName: 'Widget A',
      productSku: 'WGT-A',
      unit: 'pcs',
      quantity: 2,
      unitPrice: '20.00',
    });

    // Draft does not change stock (BR-ORD-01)
    const p1Db = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1Db.stockQuantity).toBe(50);
  });

  it('supports walk-in customer with manual contact snapshot', async () => {
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 50);

    const res = await api()
      .post(BASE)
      .set(bearer(staff))
      .send({
        customerId: null,
        customerName: 'Walk-in Guest',
        customerPhone: '9876543210',
        items: [{ productId: p1.id, quantity: 1, unitPrice: '20.00' }],
      })
      .expect(201);

    expect(res.body.data.customerId).toBeNull();
    expect(res.body.data.customerName).toBe('Walk-in Guest');
    expect(res.body.data.customerPhone).toBe('9876543210');
  });

  it('rejects discounts when user lacks orders.discount permission (A7)', async () => {
    const customer = await makeCustomer('Jane');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 50);

    // Staff role lacks orders.discount by default
    const res = await api()
      .post(BASE)
      .set(bearer(staff))
      .send({
        customerId: customer.id,
        discountType: 'FIXED',
        discountValue: '5.00',
        items: [{ productId: p1.id, quantity: 1, unitPrice: '20.00' }],
      });

    expect(res.status).toBe(403);
  });

  it('updates a draft order and recalculates totals', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 50);
    const p2 = await makeProduct('Widget B', 'WGT-B', '15.00', '30.00', 30);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 1, unitPrice: '20.00' }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    const updateRes = await api()
      .patch(`${BASE}/${orderId}`)
      .set(bearer(manager))
      .send({
        items: [
          { productId: p1.id, quantity: 2, unitPrice: '20.00' },
          { productId: p2.id, quantity: 1, unitPrice: '30.00' },
        ],
      })
      .expect(200);

    expect(updateRes.body.data.totalAmount).toBe('70.00');
    expect(updateRes.body.data.items).toHaveLength(2);
  });

  it('deletes a draft order (CASCADE on lines)', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 50);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 1 }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    await api().delete(`${BASE}/${orderId}`).set(bearer(manager)).expect(204);

    const check = await prisma.order.findUnique({ where: { id: orderId } });
    expect(check).toBeNull();
  });

  it('confirms an order: validates stock, deducts atomically via applyMovement, snapshots WAC, assigns INV-XXXXXX (BR-ORD-03)', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 10);
    const p2 = await makeProduct('Widget B', 'WGT-B', '15.00', '30.00', 5);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [
          { productId: p1.id, quantity: 3, unitPrice: '20.00' },
          { productId: p2.id, quantity: 2, unitPrice: '30.00' },
        ],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    const confirmRes = await api()
      .post(`${BASE}/${orderId}/confirm`)
      .set(bearer(manager))
      .expect(200);

    const confirmed = confirmRes.body.data;
    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(confirmed.confirmedAt).not.toBeNull();

    // Verify stock deducted
    const p1After = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    const p2After = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    expect(p1After.stockQuantity).toBe(7); // 10 - 3
    expect(p2After.stockQuantity).toBe(3); // 5 - 2

    // Verify inventory movements
    const movements = await prisma.inventoryMovement.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]!.type).toBe('SALE');
    expect(movements[0]!.quantityChange).toBe(-3);
    expect(movements[1]!.type).toBe('SALE');
    expect(movements[1]!.quantityChange).toBe(-2);

    // Verify item unitCost snapshotted
    expect(confirmed.items[0].unitCost).toBe('10.0000');
    expect(confirmed.items[1].unitCost).toBe('15.0000');

    // Confirming again returns 409 INVALID_STATE_TRANSITION (BR-ORD-04)
    await api().post(`${BASE}/${orderId}/confirm`).set(bearer(manager)).expect(409);
  });

  it('rejects confirmation when any product is short of stock, changing nothing (BR-ORD-03)', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 10);
    const p2 = await makeProduct('Widget B', 'WGT-B', '15.00', '30.00', 2); // only 2 in stock

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [
          { productId: p1.id, quantity: 5, unitPrice: '20.00' },
          { productId: p2.id, quantity: 4, unitPrice: '30.00' }, // requested 4
        ],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    const res = await api().post(`${BASE}/${orderId}/confirm`).set(bearer(manager)).expect(422);
    expect(res.body.error.message).toMatch(/Insufficient stock/);

    // Stock remained unchanged for all products
    const p1Db = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    const p2Db = await prisma.product.findUniqueOrThrow({ where: { id: p2.id } });
    expect(p1Db.stockQuantity).toBe(10);
    expect(p2Db.stockQuantity).toBe(2);

    // Order status still DRAFT
    const orderDb = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(orderDb.status).toBe('DRAFT');
  });

  it('cancels a DRAFT order directly with no stock changes (BR-ORD-01)', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 10);

    const createRes = await api()
      .post(BASE)
      .set(bearer(staff))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 2 }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    const cancelRes = await api()
      .post(`${BASE}/${orderId}/cancel`)
      .set(bearer(staff))
      .send({ reason: 'Customer changed mind' })
      .expect(200);

    expect(cancelRes.body.data.status).toBe('CANCELLED');
    expect(cancelRes.body.data.cancellationReason).toBe('Customer changed mind');

    const p1Db = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1Db.stockQuantity).toBe(10);

    const movements = await prisma.inventoryMovement.findMany({ where: { orderId } });
    expect(movements).toHaveLength(0);
  });

  it('cancels a CONFIRMED order: restores stock with SALE_CANCELLATION at snapshotted unit costs (BR-ORD-06)', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 10);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 4 }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;
    await api().post(`${BASE}/${orderId}/confirm`).set(bearer(manager)).expect(200);

    // Stock was 10, deducted to 6
    let p1Db = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1Db.stockQuantity).toBe(6);

    // Manager cancels confirmed order (requires orders.cancel)
    const cancelRes = await api()
      .post(`${BASE}/${orderId}/cancel`)
      .set(bearer(manager))
      .send({ reason: 'Cancellation requested' })
      .expect(200);

    expect(cancelRes.body.data.status).toBe('CANCELLED');

    // Stock restored to 10
    p1Db = await prisma.product.findUniqueOrThrow({ where: { id: p1.id } });
    expect(p1Db.stockQuantity).toBe(10);

    // Movements include SALE and SALE_CANCELLATION
    const movements = await prisma.inventoryMovement.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
    expect(movements).toHaveLength(2);
    expect(movements[0]!.type).toBe('SALE');
    expect(movements[0]!.quantityChange).toBe(-4);
    expect(movements[1]!.type).toBe('SALE_CANCELLATION');
    expect(movements[1]!.quantityChange).toBe(4);
    expect(new Prisma.Decimal(movements[1]!.unitCost!).toFixed(4)).toBe('10.0000');
  });

  it('fulfillment transitions: ship (CONFIRMED -> SHIPPED), deliver (SHIPPED -> DELIVERED), complete', async () => {
    const customer = await makeCustomer('John');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '20.00', 10);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ customerId: customer.id, items: [{ productId: p1.id, quantity: 1 }] })
      .expect(201);

    const orderId = createRes.body.data.id;
    await api().post(`${BASE}/${orderId}/confirm`).set(bearer(manager)).expect(200);

    // Ship order
    const shipRes = await api()
      .post(`${BASE}/${orderId}/ship`)
      .set(bearer(manager))
      .send({ carrier: 'FedEx', trackingNumber: 'TRK123456' })
      .expect(200);

    expect(shipRes.body.data.status).toBe('SHIPPED');
    expect(shipRes.body.data.carrier).toBe('FedEx');
    expect(shipRes.body.data.trackingNumber).toBe('TRK123456');

    // Reject cancellation once SHIPPED
    await api().post(`${BASE}/${orderId}/cancel`).set(bearer(manager)).expect(409);

    // Deliver order
    const deliverRes = await api()
      .post(`${BASE}/${orderId}/deliver`)
      .set(bearer(manager))
      .expect(200);

    expect(deliverRes.body.data.status).toBe('DELIVERED');
    expect(deliverRes.body.data.deliveredAt).not.toBeNull();

    // Reject cancellation once DELIVERED
    await api().post(`${BASE}/${orderId}/cancel`).set(bearer(manager)).expect(409);

    // Complete order
    const completeRes = await api()
      .post(`${BASE}/${orderId}/complete`)
      .set(bearer(manager))
      .expect(200);

    expect(completeRes.body.data.status).toBe('COMPLETED');
  });

  it('printable invoice view: GET /orders/:id/invoice', async () => {
    const customer = await makeCustomer('John Doe');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '25.00', 10);

    const createRes = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 2, unitPrice: '25.00' }],
      })
      .expect(201);

    const orderId = createRes.body.data.id;

    // Reject invoice for DRAFT
    await api().get(`${BASE}/${orderId}/invoice`).set(bearer(manager)).expect(409);

    // Confirm
    await api().post(`${BASE}/${orderId}/confirm`).set(bearer(manager)).expect(200);

    // Fetch invoice
    const invRes = await api().get(`${BASE}/${orderId}/invoice`).set(bearer(manager)).expect(200);
    const invoice = invRes.body.data;

    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(invoice.status).toBe('ISSUED');
    expect(invoice.business).toHaveProperty('businessName');
    expect(invoice.customer.name).toBe('John Doe');
    expect(invoice.subtotal).toBe('50.00');
    expect(invoice.totalAmount).toBe('50.00');
    expect(invoice.balanceDue).toBe('50.00');
    expect(invoice.items).toHaveLength(1);
    expect(invoice.items[0].productName).toBe('Widget A');
  });

  it('lists orders with filters and search (GET /orders)', async () => {
    const customer = await makeCustomer('Alice Wonderland');
    const p1 = await makeProduct('Widget A', 'WGT-A', '10.00', '25.00', 10);

    await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ customerId: customer.id, items: [{ productId: p1.id, quantity: 1 }] })
      .expect(201);

    const listRes = await api()
      .get(BASE)
      .set(bearer(manager))
      .query({ search: 'Alice', status: 'DRAFT' })
      .expect(200);

    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].customerName).toBe('Alice Wonderland');
  });
});
