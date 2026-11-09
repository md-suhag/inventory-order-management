import { beforeEach, describe, expect, it } from 'vitest';
import type { PurchaseStatus } from '@prisma/client';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/suppliers';

let manager: Session;
let seq = 0;

const makeSupplier = (name: string, extra: { status?: 'ACTIVE' | 'ARCHIVED'; email?: string; phone?: string } = {}) =>
  prisma.supplier.create({ data: { name, ...extra } });

const makePurchase = (supplierId: string, status: PurchaseStatus, total: string, paid = '0', refunded = '0') =>
  prisma.purchase.create({
    data: {
      purchaseNumber: `PO-T-${++seq}`,
      supplierId,
      status,
      subtotal: total,
      totalAmount: total,
      paidAmount: paid,
      refundedAmount: refunded,
      createdById: manager.userId,
    },
  });

beforeEach(async () => {
  await resetDatabase();
  manager = await loginAs('MANAGER');
});

describe('GET /suppliers', () => {
  it('lists with search over name/contact/phone/email, status filter and sort', async () => {
    await makeSupplier('Acme Traders', { email: 'sales@acme.test' });
    await makeSupplier('Beta Supply', { phone: '+880 1711 000000' });
    await makeSupplier('Old Vendor', { status: 'ARCHIVED' });

    const all = await api().get(BASE).set(bearer(manager)).expect(200);
    expect(all.body.data.map((s: { name: string }) => s.name)).toEqual(['Acme Traders', 'Beta Supply', 'Old Vendor']);

    const active = await api().get(BASE).set(bearer(manager)).query({ status: 'ACTIVE', sort: 'name:desc' }).expect(200);
    expect(active.body.data.map((s: { name: string }) => s.name)).toEqual(['Beta Supply', 'Acme Traders']);

    const byEmail = await api().get(BASE).set(bearer(manager)).query({ search: 'ACME.TEST' }).expect(200);
    expect(byEmail.body.meta.total).toBe(1);
    const byPhone = await api().get(BASE).set(bearer(manager)).query({ search: '1711' }).expect(200);
    expect(byPhone.body.data[0].name).toBe('Beta Supply');
  });

  it('STAFF has no supplier access by default', async () => {
    const staff = await loginAs('STAFF');
    expect((await api().get(BASE).set(bearer(staff))).status).toBe(403);
  });
});

describe('GET /suppliers/:id', () => {
  it('returns the balance summary over active purchases only (BR-PAY-08)', async () => {
    const s = await makeSupplier('Acme');
    await makePurchase(s.id, 'RECEIVED', '100.00', '60.00');
    await makePurchase(s.id, 'ORDERED', '50.00', '80.00', '30.00'); // net paid 50 → balance 0
    await makePurchase(s.id, 'DRAFT', '999.00');
    await makePurchase(s.id, 'CANCELLED', '500.00');

    const res = await api().get(`${BASE}/${s.id}`).set(bearer(manager)).expect(200);
    expect(res.body.data.summary).toEqual({
      purchaseCount: 2,
      totalPurchased: '150.00',
      totalPaid: '110.00',
      outstandingBalance: '40.00',
    });
  });

  it('returns 404 for unknown ids', async () => {
    const res = await api().get(`${BASE}/0190f3a0-0000-7000-8000-000000000000`).set(bearer(manager));
    expect(res.status).toBe(404);
  });
});

describe('POST / PATCH /suppliers', () => {
  it('creates and updates with normalisation, clearing and audit', async () => {
    const created = await api()
      .post(BASE)
      .set(bearer(manager))
      .send({ name: ' Acme ', contactPerson: 'Rahim', email: ' Sales@Acme.TEST ', phone: '01711-000000' })
      .expect(201);
    expect(created.body.data).toMatchObject({ name: 'Acme', email: 'sales@acme.test', status: 'ACTIVE', address: null });
    const id = created.body.data.id;

    const updated = await api().patch(`${BASE}/${id}`).set(bearer(manager)).send({ email: '', notes: 'Net 30' }).expect(200);
    expect(updated.body.data).toMatchObject({ email: null, notes: 'Net 30', contactPerson: 'Rahim' });

    const audits = await prisma.auditLog.findMany({ where: { entityId: id }, orderBy: { createdAt: 'asc' } });
    expect(audits.map((a) => a.action)).toEqual(['supplier.created', 'supplier.updated']);
    expect(audits[1]!.metadata).toMatchObject({ changes: { email: { from: 'sales@acme.test', to: null } } });
  });

  it('validates input', async () => {
    const bad = await api().post(BASE).set(bearer(manager)).send({ name: 'X', email: 'nope', phone: 'abc' });
    expect(bad.status).toBe(422);
    const empty = await api().patch(`${BASE}/0190f3a0-0000-7000-8000-000000000000`).set(bearer(manager)).send({});
    expect(empty.status).toBe(422);
  });
});

describe('archive / unarchive / delete', () => {
  it('archive is idempotent and audited once', async () => {
    const s = await makeSupplier('Seasonal');
    const off = await api().post(`${BASE}/${s.id}/archive`).set(bearer(manager)).expect(200);
    expect(off.body.data.status).toBe('ARCHIVED');
    await api().post(`${BASE}/${s.id}/archive`).set(bearer(manager)).expect(200);
    expect(await prisma.auditLog.count({ where: { action: 'supplier.archived', entityId: s.id } })).toBe(1);
    const on = await api().post(`${BASE}/${s.id}/unarchive`).set(bearer(manager)).expect(200);
    expect(on.body.data.status).toBe('ACTIVE');
  });

  it('deletes unreferenced suppliers; referenced ones return 409 REFERENCED (FR-SUP-02)', async () => {
    const unused = await makeSupplier('Unused');
    await api().delete(`${BASE}/${unused.id}`).set(bearer(manager)).expect(204);
    expect(await prisma.supplier.findUnique({ where: { id: unused.id } })).toBeNull();

    const used = await makeSupplier('Used');
    await makePurchase(used.id, 'DRAFT', '0');
    const res = await api().delete(`${BASE}/${used.id}`).set(bearer(manager));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFERENCED');
  });
});
