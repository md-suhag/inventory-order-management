import { describe, expect, it } from 'vitest';
import { calculateDocumentPreview, formatBytes, formatCost, formatDate, formatMoney } from '@/lib/format';

describe('format helpers', () => {
  it('formats money with business currency and locale (NFR-UX-06)', () => {
    expect(formatMoney('1234.5', { currencyCode: 'USD', locale: 'en-US' })).toBe('$1,234.50');
    expect(formatMoney(null)).toBe('$0.00');
    expect(formatMoney('not-a-number', { currencyCode: 'EUR', locale: 'en-US' })).toBe('€0.00');
  });

  it('falls back safely when currency code is invalid', () => {
    expect(formatMoney('42.5', { currencyCode: 'INVALID', locale: 'en-US' })).toBe('INVALID 42.50');
  });

  it('formats 4-decimal costs and missing cost sentinel', () => {
    expect(formatCost('12.3456', { currencyCode: 'USD' })).toBe('USD 12.3456');
    expect(formatCost(undefined)).toBe('—');
    expect(formatCost(null)).toBe('—');
  });

  it('formats ISO timestamps and byte sizes cleanly', () => {
    expect(formatDate('2026-11-10T10:30:00.000Z', { locale: 'en-US', timezone: 'UTC' })).toContain('2026');
    expect(formatDate(null)).toBe('—');
    expect(formatDate('invalid-date')).toBe('—');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.00 MB');
  });
});

describe('calculateDocumentPreview', () => {
  it('calculates line discounts, percentage header discount, and taxes accurately', () => {
    // Line 1: 2 * 50.00 - 10.00 = 90.00 net
    // Line 2: 1 * 110.00 = 110.00 net
    // Subtotal = 200.00; 10% header discount = 20.00 -> taxable 81.00 + 99.00; 10% tax = 8.10 + 9.90 = 18.00
    // Total = 200.00 - 20.00 + 18.00 = 198.00
    const res = calculateDocumentPreview(
      [
        { quantity: 2, unitAmount: '50.00', discountAmount: '10.00', taxRate: '10' },
        { quantity: 1, unitAmount: '110.00', discountAmount: '0.00', taxRate: '10' },
      ],
      'PERCENTAGE',
      '10',
    );

    expect(res.subtotal).toBe('200.00');
    expect(res.discountAmount).toBe('20.00');
    expect(res.taxAmount).toBe('18.00');
    expect(res.totalAmount).toBe('198.00');
    expect(res.lineTotals).toEqual(['89.10', '108.90']);
  });

  it('caps fixed header discount at subtotal and falls back safely on bad numeric strings', () => {
    const capped = calculateDocumentPreview([{ quantity: 1, unitAmount: '25.00' }], 'FIXED', '50.00');
    expect(capped.discountAmount).toBe('25.00');
    expect(capped.totalAmount).toBe('0.00');

    const bad = calculateDocumentPreview([{ quantity: 1, unitAmount: 'bad' }]);
    expect(bad.totalAmount).toBe('0.00');
  });
});
