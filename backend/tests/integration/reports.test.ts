import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/reports';

let manager: Session;
let staff: Session;

const makeCustomer = (name: string) =>
  prisma.customer.create({ data: { name, phone: '1234567890', address: '123 Street' } });

const makeSupplier = (name: string) =>
  prisma.supplier.create({ data: { name, contactPerson: 'John', phone: '0987654321', email: 'sup@test.local' } });

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

describe('Reports Module (Phase 6)', () => {
  it('generates sales summary with revenue, discounts, returns and net sales (FR-REP-01, 04)', async () => {
    const customer = await makeCustomer('Sales Customer');
    const p1 = await makeProduct('Widget X', 'W-X', '10.00', '30.00', 100);

    // 1. Create order: 5 * 30 = 150, discount 10 = 140
    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 5, unitPrice: '30.00', discountAmount: '10.00' }],
      })
      .expect(201);

    const orderId = orderRes.body.data.id;
    await api().post(`/api/v1/orders/${orderId}/confirm`).set(bearer(manager)).expect(200);
    await api().post(`/api/v1/orders/${orderId}/complete`).set(bearer(manager)).expect(200);

    // 2. Return 1 item: 1 * 28 = 28 (allocated line discount: 10 / 5 = 2 per unit)
    const retRes = await api()
      .post('/api/v1/sales-returns')
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-rep-ret')
      .send({
        orderId,
        reason: 'Surplus',
        items: [{ orderItemId: orderRes.body.data.items[0].id, quantity: 1, condition: 'RESALABLE' }],
      })
      .expect(201);

    await api()
      .post(`/api/v1/sales-returns/${retRes.body.data.id}/complete`)
      .set(bearer(manager))
      .send({})
      .expect(200);

    // 3. Get sales summary
    const summaryRes = await api()
      .get(`${BASE}/sales/summary`)
      .set(bearer(manager))
      .expect(200);

    expect(summaryRes.body.data.totals.grossSales).toBe('150.00');
    expect(summaryRes.body.data.totals.discounts).toBe('10.00');
    expect(summaryRes.body.data.totals.returns).toBe('28.00');
    expect(summaryRes.body.data.totals.netSales).toBe('112.00'); // 150 - 10 - 28
    expect(summaryRes.body.data.totals.orderCount).toBe(1);
    expect(summaryRes.body.data.byPeriod.length).toBeGreaterThanOrEqual(1);
  });

  it('generates sales by product with cost gating (FR-REP-02)', async () => {
    const customer = await makeCustomer('Prod Customer');
    const p1 = await makeProduct('Widget P', 'W-P', '12.00', '25.00', 50);

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 2, unitPrice: '25.00' }],
      })
      .expect(201);

    await api().post(`/api/v1/orders/${orderRes.body.data.id}/confirm`).set(bearer(manager)).expect(200);

    // Manager (has products.view_cost) sees cogs and grossProfit
    const mgrRes = await api()
      .get(`${BASE}/sales/by-product`)
      .set(bearer(manager))
      .expect(200);

    const pRowMgr = mgrRes.body.data.data.find((p: { productId: string }) => p.productId === p1.id);
    expect(pRowMgr).toBeDefined();
    expect(pRowMgr.quantitySold).toBe(2);
    expect(pRowMgr.netSales).toBe('50.00');
    expect(pRowMgr.cogs).toBe('24.00'); // 2 * 12.00
    expect(pRowMgr.grossProfit).toBe('26.00'); // 50 - 24

    // Staff (no products.view_cost) does NOT see cogs or grossProfit
    const staffRes = await api()
      .get(`${BASE}/sales/by-product`)
      .set(bearer(staff))
      .expect(200);

    const pRowStaff = staffRes.body.data.data.find((p: { productId: string }) => p.productId === p1.id);
    expect(pRowStaff).toBeDefined();
    expect(pRowStaff.cogs).toBeUndefined();
    expect(pRowStaff.grossProfit).toBeUndefined();
  });

  it('generates sales by customer (FR-REP-03)', async () => {
    const customer = await makeCustomer('Top Customer');
    const p1 = await makeProduct('Item C', 'ITM-C', '5.00', '15.00', 50);

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 3, unitPrice: '15.00' }],
      })
      .expect(201);

    await api().post(`/api/v1/orders/${orderRes.body.data.id}/confirm`).set(bearer(manager)).expect(200);

    const res = await api()
      .get(`${BASE}/sales/by-customer`)
      .set(bearer(manager))
      .expect(200);

    const cRow = res.body.data.data.find((c: { customerId: string }) => c.customerId === customer.id);
    expect(cRow).toBeDefined();
    expect(cRow.orderCount).toBe(1);
    expect(cRow.netSales).toBe('45.00');
    expect(cRow.outstandingBalance).toBe('45.00');
  });

  it('generates purchases report (FR-REP-05)', async () => {
    const supplier = await makeSupplier('Acme Supplies');
    const p1 = await makeProduct('Raw Material', 'RM-1', '5.00', '10.00', 0);

    // Create and confirm purchase
    const poRes = await api()
      .post('/api/v1/purchases')
      .set(bearer(manager))
      .send({
        supplierId: supplier.id,
        items: [{ productId: p1.id, quantity: 10, unitCost: '5.00' }],
      })
      .expect(201);

    await api().post(`/api/v1/purchases/${poRes.body.data.id}/confirm`).set(bearer(manager)).expect(200);

    // Receive goods
    await api()
      .post(`/api/v1/purchases/${poRes.body.data.id}/receipts`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-rep-rcv')
      .send({
        items: [{ purchaseItemId: poRes.body.data.items[0].id, quantity: 10 }],
      })
      .expect(201);

    const res = await api()
      .get(`${BASE}/purchases`)
      .set(bearer(manager))
      .expect(200);

    expect(res.body.data.summary.orderedAmount).toBe('50.00');
    expect(res.body.data.summary.receivedValue).toBe('50.00');
    expect(res.body.data.bySupplier.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data.purchases.data.length).toBeGreaterThanOrEqual(1);
  });

  it('generates inventory summary and valuation reports (FR-REP-06, 07, 08)', async () => {
    await makeProduct('In Stock Product', 'ISP', '10.00', '20.00', 100);
    await makeProduct('Low Stock Product', 'LSP', '5.00', '10.00', 3);
    await makeProduct('Out of Stock Product', 'OSP', '8.00', '15.00', 0);

    // Inventory summary (accessible to staff with reports.inventory)
    const summaryRes = await api()
      .get(`${BASE}/inventory/summary`)
      .set(bearer(manager))
      .expect(200);

    expect(summaryRes.body.data.statusCounts.totalProducts).toBeGreaterThanOrEqual(3);
    expect(summaryRes.body.data.statusCounts.inStock).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.data.statusCounts.lowStock).toBeGreaterThanOrEqual(1);
    expect(summaryRes.body.data.statusCounts.outOfStock).toBeGreaterThanOrEqual(1);

    // Inventory valuation requires products.view_cost
    await api()
      .get(`${BASE}/inventory/valuation`)
      .set(bearer(staff))
      .expect(403);

    const valuationRes = await api()
      .get(`${BASE}/inventory/valuation`)
      .set(bearer(manager))
      .expect(200);

    expect(Number(valuationRes.body.data.totalValuation)).toBeGreaterThan(0);
    expect(valuationRes.body.data.items.data.length).toBeGreaterThanOrEqual(3);
  });

  it('generates financial summary and aging reports (FR-REP-09, 10, 11)', async () => {
    const customer = await makeCustomer('Finance Customer');
    const p1 = await makeProduct('Fin Prod', 'FP-1', '10.00', '25.00', 50);

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(manager))
      .send({
        customerId: customer.id,
        items: [{ productId: p1.id, quantity: 2, unitPrice: '25.00' }],
      })
      .expect(201);

    await api().post(`/api/v1/orders/${orderRes.body.data.id}/confirm`).set(bearer(manager)).expect(200);

    // Payment
    const method = await prisma.paymentMethod.findFirstOrThrow({ where: { code: 'CASH' } });
    await api()
      .post(`/api/v1/orders/${orderRes.body.data.id}/payments`)
      .set(bearer(manager))
      .set('Idempotency-Key', 'idem-fin-pay')
      .send({
        paymentMethodId: method.id,
        amount: '20.00',
      })
      .expect(201);

    // Financial summary
    const finRes = await api()
      .get(`${BASE}/financial/summary`)
      .set(bearer(manager))
      .expect(200);

    expect(finRes.body.data.revenue.netSales).toBe('50.00');
    expect(finRes.body.data.costs.cogs).toBe('20.00');
    expect(finRes.body.data.costs.estimatedGrossProfit).toBe('30.00');
    expect(finRes.body.data.cashFlow.moneyIn).toBe('20.00');
    expect(finRes.body.data.balances.outstandingCustomerBalance).toBe('30.00'); // 50 - 20

    // Financial aging
    const agingRes = await api()
      .get(`${BASE}/financial/aging`)
      .set(bearer(manager))
      .expect(200);

    expect(agingRes.body.data.customers.summary.total).toBe('30.00');
    expect(agingRes.body.data.customers.summary.current).toBe('30.00');
  });
});
