import type { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const URL = '/api/v1/dashboard/summary';

let manager: Session;
let seq = 0;

const makeOrder = (status: OrderStatus, createdAt: Date, total = '0', paid = '0') => {
  seq += 1;
  const confirmed = status !== 'DRAFT';
  return prisma.order.create({
    data: {
      orderNumber: `SO-D-${seq}`,
      invoiceNumber: confirmed ? `INV-D-${seq}` : null,
      confirmedAt: confirmed ? createdAt : null,
      customerName: 'Walk-in',
      status,
      subtotal: total,
      totalAmount: total,
      paidAmount: paid,
      createdAt,
      createdById: manager.userId,
    },
  });
};

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
});

describe('GET /dashboard/summary', () => {
  it('returns counts, stock alerts, orders in range and financial tiles (FR-DASH-01..05)', async () => {
    await prisma.businessSetting.update({ where: { id: 1 }, data: { timezone: 'Asia/Dhaka' } });
    await prisma.product.createMany({
      data: [
        { sku: 'P1', name: 'Out', sellingPrice: '1', stockQuantity: 0 },
        { sku: 'P2', name: 'Low', sellingPrice: '1', stockQuantity: 2, costPrice: '3.5' },
        { sku: 'P3', name: 'Fine', sellingPrice: '1', stockQuantity: 20, costPrice: '1.25', reorderLevel: 5 },
        { sku: 'P4', name: 'Gone', sellingPrice: '1', stockQuantity: 0, status: 'ARCHIVED' },
      ],
    });
    await prisma.customer.create({ data: { name: 'C' } });
    await prisma.supplier.createMany({ data: [{ name: 'S1' }, { name: 'S2', status: 'ARCHIVED' }] });

    // 2026-03-01 00:30 in Dhaka (UTC+6) is 2026-02-28 18:30 UTC — inside a March range.
    await makeOrder('CONFIRMED', new Date('2026-02-28T18:30:00Z'), '100.00', '40.00');
    await makeOrder('DRAFT', new Date('2026-03-15T10:00:00Z'));
    await makeOrder('COMPLETED', new Date('2026-04-01T10:00:00Z'), '50.00', '50.00'); // outside range

    const res = await api().get(URL).set(bearer(manager)).query({ from: '2026-03-01', to: '2026-03-31' }).expect(200);
    const d = res.body.data;
    expect(d.range).toEqual({ from: '2026-03-01', to: '2026-03-31', timezone: 'Asia/Dhaka' });
    expect(d.counts).toEqual({ activeProducts: 3, activeCustomers: 1, activeSuppliers: 1 });
    expect(d.orders).toEqual({
      createdInRange: { DRAFT: 1, CONFIRMED: 1, COMPLETED: 0, CANCELLED: 0 },
      pending: 1,
      drafts: 1,
    });
    expect(d.stock).toMatchObject({ lowStock: 1, outOfStock: 1 });
    expect(d.stock.items.map((i: { sku: string; stockState: string }) => [i.sku, i.stockState])).toEqual([
      ['P1', 'OUT'],
      ['P2', 'LOW'],
    ]);
    expect(d.recentOrders).toHaveLength(3);
    expect(d.recentPurchases).toEqual([]);
    expect(d.financials).toEqual({
      inventoryValue: '32.00', // 2 × 3.5 + 20 × 1.25
      outstandingCustomerBalance: '60.00',
      outstandingSupplierBalance: '0.00',
    });
  });

  it('defaults to the current month and hides financials and purchases from STAFF', async () => {
    const staff = await loginAs('STAFF');
    const res = await api().get(URL).set(bearer(staff)).expect(200);
    expect(res.body.data.range.from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(res.body.data).not.toHaveProperty('financials');
    expect(res.body.data).not.toHaveProperty('recentPurchases');
    expect(res.body.data).toHaveProperty('recentOrders');
  });

  it('validates the range', async () => {
    const res = await api().get(URL).set(bearer(manager)).query({ from: '2026-03-10', to: '2026-03-01' });
    expect(res.status).toBe(422);
  });
});
