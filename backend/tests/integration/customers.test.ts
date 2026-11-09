import { beforeEach, describe, expect, it } from 'vitest';
import type { OrderStatus } from '@prisma/client';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/customers';

let manager: Session;
let seq = 0;

const makeCustomer = (name: string, extra: { status?: 'ACTIVE' | 'ARCHIVED'; email?: string; phone?: string } = {}) =>
  prisma.customer.create({ data: { name, ...extra } });

const makeOrder = (
  customerId: string,
  status: OrderStatus,
  total: string,
  amounts: { paid?: string; refunded?: string; returned?: string } = {},
) => {
  const confirmed = status !== 'DRAFT';
  seq += 1;
  return prisma.order.create({
    data: {
      orderNumber: `SO-T-${seq}`,
      invoiceNumber: confirmed ? `INV-T-${seq}` : null,
      confirmedAt: confirmed ? new Date() : null,
      customerId,
      status,
      subtotal: total,
      totalAmount: total,
      paidAmount: amounts.paid ?? '0',
      refundedAmount: amounts.refunded ?? '0',
      returnedAmount: amounts.returned ?? '0',
      createdById: manager.userId,
    },
  });
};

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
});

describe('GET /customers', () => {
  it('lists with search over name/phone/email, status filter and sort', async () => {
    await makeCustomer('Karim', { phone: '01811-222333' });
    await makeCustomer('Ayesha', { email: 'ayesha@mail.test' });
    await makeCustomer('Gone', { status: 'ARCHIVED' });

    const all = await api().get(BASE).set(bearer(manager)).expect(200);
    expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(['Ayesha', 'Gone', 'Karim']);

    const active = await api().get(BASE).set(bearer(manager)).query({ status: 'ACTIVE' }).expect(200);
    expect(active.body.meta.total).toBe(2);

    const byPhone = await api().get(BASE).set(bearer(manager)).query({ search: '222333' }).expect(200);
    expect(byPhone.body.data.map((c: { name: string }) => c.name)).toEqual(['Karim']);
  });
});

describe('GET /customers/:id', () => {
  it('returns the balance summary over confirmed/completed orders, net of returns (BR-PAY-08)', async () => {
    const c = await makeCustomer('Karim');
    await makeOrder(c.id, 'CONFIRMED', '100.00', { paid: '30.00' }); // balance 70
    await makeOrder(c.id, 'COMPLETED', '80.00', { paid: '80.00', refunded: '10.00', returned: '20.00' }); // balance -10 → 0
    await makeOrder(c.id, 'DRAFT', '999.00');
    await makeOrder(c.id, 'CANCELLED', '500.00', { paid: '500.00', refunded: '500.00' });

    const res = await api().get(`${BASE}/${c.id}`).set(bearer(manager)).expect(200);
    expect(res.body.data.summary).toEqual({
      orderCount: 2,
      totalSales: '160.00',
      totalPaid: '100.00',
      outstandingBalance: '70.00',
    });
  });
});

describe('POST / PATCH /customers', () => {
  it('STAFF can create and edit with audit', async () => {
    const staff = await loginAs('STAFF');
    const created = await api().post(BASE).set(bearer(staff)).send({ name: 'Walk-in Regular', phone: '01711000000' }).expect(201);
    const id = created.body.data.id;
    const updated = await api().patch(`${BASE}/${id}`).set(bearer(staff)).send({ address: 'Dhaka' }).expect(200);
    expect(updated.body.data).toMatchObject({ name: 'Walk-in Regular', address: 'Dhaka', email: null });
    const actions = (await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['customer.created', 'customer.updated']);
  });

  it('validates input', async () => {
    const bad = await api().post(BASE).set(bearer(manager)).send({ name: '', email: 'x@' });
    expect(bad.status).toBe(422);
  });
});

describe('archive / unarchive / delete', () => {
  it('requires customers.archive (STAFF lacks it)', async () => {
    const c = await makeCustomer('Karim');
    const staff = await loginAs('STAFF');
    expect((await api().post(`${BASE}/${c.id}/archive`).set(bearer(staff))).status).toBe(403);
    expect((await api().delete(`${BASE}/${c.id}`).set(bearer(staff))).status).toBe(403);
  });

  it('archives idempotently; deletes only unreferenced customers', async () => {
    const c = await makeCustomer('Karim');
    const off = await api().post(`${BASE}/${c.id}/archive`).set(bearer(manager)).expect(200);
    expect(off.body.data.status).toBe('ARCHIVED');
    await api().post(`${BASE}/${c.id}/archive`).set(bearer(manager)).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'customer.archived', entityId: c.id } })).toBe(1);
    await api().post(`${BASE}/${c.id}/unarchive`).set(bearer(manager)).expect(200);

    await api().delete(`${BASE}/${c.id}`).set(bearer(manager)).expect(204);
    expect(await prisma.customer.findUnique({ where: { id: c.id } })).toBeNull();

    const used = await makeCustomer('Used');
    await makeOrder(used.id, 'DRAFT', '0');
    const res = await api().delete(`${BASE}/${used.id}`).set(bearer(manager));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFERENCED');
  });
});
