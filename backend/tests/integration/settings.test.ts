import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

const BASE = '/api/v1/settings';

let admin: Session;
let staff: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await loginAs('ADMIN');
  staff = await loginAs('STAFF');
});

describe('Settings Module (Phase 6)', () => {
  it('retrieves business settings, sequences, and payment methods (FR-SET-01..07)', async () => {
    const res = await api().get(BASE).set(bearer(staff)).expect(200);

    expect(res.body.data.settings).toBeDefined();
    expect(res.body.data.settings.id).toBe(1);
    expect(res.body.data.settings.businessName).toBe('My Business');
    expect(res.body.data.settings.currencyCode).toBe('USD');
    expect(res.body.data.documentSequences.length).toBeGreaterThanOrEqual(6);
    expect(res.body.data.paymentMethods.length).toBeGreaterThanOrEqual(5);
  });

  it('updates business settings with audit log (FR-SET-01, 03, 05, 06)', async () => {
    // Staff/manager without settings.update cannot update
    await api()
      .patch(BASE)
      .set(bearer(staff))
      .send({ businessName: 'Hacked Store' })
      .expect(403);

    const updateRes = await api()
      .patch(BASE)
      .set(bearer(admin))
      .send({
        businessName: 'Acme MegaStore',
        legalName: 'Acme Global Inc.',
        taxEnabled: true,
        defaultTaxRate: '15.0000',
        defaultLowStockThreshold: 15,
        allowSelfRegistration: true,
      })
      .expect(200);

    expect(updateRes.body.data.businessName).toBe('Acme MegaStore');
    expect(updateRes.body.data.legalName).toBe('Acme Global Inc.');
    expect(updateRes.body.data.taxEnabled).toBe(true);
    expect(updateRes.body.data.defaultTaxRate).toBe('15.0000');
    expect(updateRes.body.data.defaultLowStockThreshold).toBe(15);
    expect(updateRes.body.data.allowSelfRegistration).toBe(true);

    // Verify audit log
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.updated' },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorId).toBe(admin.userId);

    // PUT /settings works as well
    const putRes = await api()
      .put(BASE)
      .set(bearer(admin))
      .send({ invoiceFooter: 'Thank you for shopping!' })
      .expect(200);

    expect(putRes.body.data.invoiceFooter).toBe('Thank you for shopping!');
  });

  it('allows changing currency before transactions exist, but blocks after transactions exist (FR-SET-02)', async () => {
    // 1. Can change currency while clean
    const changeRes = await api()
      .patch(BASE)
      .set(bearer(admin))
      .send({ currencyCode: 'EUR' })
      .expect(200);

    expect(changeRes.body.data.currencyCode).toBe('EUR');

    // 2. Create and confirm an order
    const customer = await prisma.customer.create({ data: { name: 'Curr Cust' } });
    const product = await prisma.product.create({
      data: { name: 'P Curr', sku: 'PC-1', costPrice: '10.00', sellingPrice: '20.00', stockQuantity: 10 },
    });

    const orderRes = await api()
      .post('/api/v1/orders')
      .set(bearer(admin))
      .send({
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 1, unitPrice: '20.00' }],
      })
      .expect(201);

    await api().post(`/api/v1/orders/${orderRes.body.data.id}/confirm`).set(bearer(admin)).expect(200);

    // 3. Attempting to change currency now must fail with 422
    const failRes = await api()
      .patch(BASE)
      .set(bearer(admin))
      .send({ currencyCode: 'GBP' })
      .expect(422);

    expect(failRes.body.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });

  it('updates document sequence prefix and padding (FR-SET-04)', async () => {
    const res = await api()
      .patch(`${BASE}/sequences/SALES_RETURN`)
      .set(bearer(admin))
      .send({ prefix: 'SR', padding: 8 })
      .expect(200);

    expect(res.body.data.documentType).toBe('SALES_RETURN');
    expect(res.body.data.prefix).toBe('SR');
    expect(res.body.data.padding).toBe(8);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.sequence_updated' },
    });
    expect(audit).not.toBeNull();
  });

  it('updates payment method configuration (FR-SET-07)', async () => {
    const method = await prisma.paymentMethod.findFirstOrThrow({ where: { code: 'CHEQUE' } });

    const res = await api()
      .patch(`${BASE}/payment-methods/${method.id}`)
      .set(bearer(admin))
      .send({ name: 'Bank Cheque', isActive: false, sortOrder: 99 })
      .expect(200);

    expect(res.body.data.name).toBe('Bank Cheque');
    expect(res.body.data.isActive).toBe(false);
    expect(res.body.data.sortOrder).toBe(99);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'settings.payment_method_updated' },
    });
    expect(audit).not.toBeNull();
  });
});
