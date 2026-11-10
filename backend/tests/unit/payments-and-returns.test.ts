import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { isPermission } from '../../src/common/auth/permissions';
import { listRouteSecurity } from '../../src/routes';
import { computeOrderPaymentStatus } from '../../src/modules/payments/payments.service';
import { calculateLineCredit } from '../../src/modules/sales-returns/sales-returns.service';

describe('computeOrderPaymentStatus (BR-PAY-03..06, BR-RET-05)', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it('handles unpaid, partially paid and fully paid active orders', () => {
    expect(computeOrderPaymentStatus(d('100.00'), d('0.00'), d('0.00'))).toBe('UNPAID');
    expect(computeOrderPaymentStatus(d('100.00'), d('40.00'), d('0.00'))).toBe('PARTIALLY_PAID');
    expect(computeOrderPaymentStatus(d('100.00'), d('100.00'), d('0.00'))).toBe('PAID');
    expect(computeOrderPaymentStatus(d('120.00'), d('125.00'), d('0.00'))).toBe('PAID');
  });

  it('transitions to PAID when completed returns reduce effective total to net paid', () => {
    // 100 order with 60 paid and 40 returned -> effective total = 60 -> PAID
    expect(computeOrderPaymentStatus(d('60.00'), d('60.00'), d('0.00'))).toBe('PAID');
  });

  it('tracks partial and full refunds cleanly', () => {
    expect(computeOrderPaymentStatus(d('100.00'), d('100.00'), d('30.00'))).toBe('PARTIALLY_REFUNDED');
    expect(computeOrderPaymentStatus(d('0.00'), d('100.00'), d('100.00'))).toBe('REFUNDED');
  });

  it('marks zero effective total with zero payments as PAID', () => {
    expect(computeOrderPaymentStatus(d('0.00'), d('0.00'), d('0.00'))).toBe('PAID');
  });
});

describe('calculateLineCredit (BR-RET-04)', () => {
  const d = (v: string) => new Prisma.Decimal(v);

  it('prorates partial returns and absorbs rounding remainder on final returned quantity', () => {
    // 3 units @ 10.00 each, 1.00 discount -> taxable = 29.00, 10% tax = 2.90
    const orderItem = {
      quantity: 3,
      unitPrice: d('10.00'),
      discountAmount: d('1.00'),
      allocatedDiscount: d('0.00'),
      taxAmount: d('2.90'),
    };

    // First return: 1 of 3 -> 29.00 / 3 = 9.67, tax = 2.90 / 3 = 0.97
    const r1 = calculateLineCredit(orderItem, 1, 0, d('0.00'), d('0.00'));
    expect(r1.subtotal.toFixed(2)).toBe('9.67');
    expect(r1.taxAmount.toFixed(2)).toBe('0.97');
    expect(r1.totalAmount.toFixed(2)).toBe('10.64');

    // Second return: remaining 2 units -> must absorb rounding so sum equals 29.00 + 2.90
    const r2 = calculateLineCredit(orderItem, 2, 1, r1.subtotal, r1.taxAmount);
    expect(r2.subtotal.toFixed(2)).toBe('19.33');
    expect(r2.taxAmount.toFixed(2)).toBe('1.93');
    expect(r2.totalAmount.toFixed(2)).toBe('21.26');

    expect(r1.subtotal.add(r2.subtotal).toFixed(2)).toBe('29.00');
    expect(r1.taxAmount.add(r2.taxAmount).toFixed(2)).toBe('2.90');
  });
});

describe('API route authentication & RBAC matrix (NFR-SEC-04)', () => {
  const PUBLIC_ROUTES = new Set([
    'get /api/v1/health/live',
    'get /api/v1/health/ready',
    'post /api/v1/auth/login',
    'post /api/v1/auth/refresh',
    'post /api/v1/auth/logout',
    'post /api/v1/auth/register',
    'post /api/v1/auth/forgot-password',
    'post /api/v1/auth/reset-password',
  ]);

  const AUTH_ONLY_SELF_SERVICE = new Set([
    'post /api/v1/auth/logout-all',
    'get /api/v1/auth/me',
    'patch /api/v1/auth/me',
    'post /api/v1/auth/change-password',
    'get /api/v1/settings',
  ]);

  it('protects every non-public route with authenticate and every business route with authorize()', () => {
    const routes = listRouteSecurity();
    expect(routes.length).toBeGreaterThan(20);

    for (const r of routes) {
      const sig = `${r.method} ${r.path}`;
      if (PUBLIC_ROUTES.has(sig)) continue;

      expect(r.authenticated, `${sig} must require authenticate`).toBe(true);
      if (AUTH_ONLY_SELF_SERVICE.has(sig)) continue;

      expect(r.permissions.length, `${sig} must declare at least one permission`).toBeGreaterThan(0);
      for (const perm of r.permissions) {
        expect(isPermission(perm), `${sig} references unknown permission "${perm}"`).toBe(true);
      }
    }
  });
});
