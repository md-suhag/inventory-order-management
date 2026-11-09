import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { calculateDocumentTotals } from '../../src/common/pricing/document-calculator';

describe('calculateDocumentTotals (BR-CALC-01..09)', () => {
  it('calculates single line with no discounts or taxes', () => {
    const res = calculateDocumentTotals([
      {
        productId: 'prod-1',
        quantity: 5,
        unitCostOrPrice: '10.00',
      },
    ]);

    expect(res.subtotal.toString()).toBe('50');
    expect(res.discountAmount.toString()).toBe('0');
    expect(res.taxAmount.toString()).toBe('0');
    expect(res.totalAmount.toString()).toBe('50');

    expect(res.lines).toHaveLength(1);
    const line = res.lines[0]!;
    expect(line.gross.toString()).toBe('50');
    expect(line.lineDiscount.toString()).toBe('0');
    expect(line.allocatedDiscount.toString()).toBe('0');
    expect(line.taxable.toString()).toBe('50');
    expect(line.taxAmount.toString()).toBe('0');
    expect(line.lineTotal.toString()).toBe('50');
    expect(line.netUnitCost.toString()).toBe('10');
  });

  it('calculates line discounts correctly (BR-CALC-02, 03)', () => {
    const res = calculateDocumentTotals([
      {
        productId: 'prod-1',
        quantity: 2,
        unitCostOrPrice: '25.00',
        lineDiscount: '5.00',
      },
      {
        productId: 'prod-2',
        quantity: 1,
        unitCostOrPrice: '50.00',
        lineDiscount: '10.00',
      },
    ]);

    // Line 1: gross = 50, discount = 5 -> net = 45
    // Line 2: gross = 50, discount = 10 -> net = 40
    // Subtotal: 85
    expect(res.subtotal.toString()).toBe('85');
    expect(res.totalAmount.toString()).toBe('85');
    expect(res.lines[0]!.taxable.toString()).toBe('45');
    expect(res.lines[1]!.taxable.toString()).toBe('40');
  });

  it('allocates header discount using largest-remainder method on cents (BR-CALC-05)', () => {
    const res = calculateDocumentTotals(
      [
        { productId: 'p1', quantity: 1, unitCostOrPrice: '10.00' },
        { productId: 'p2', quantity: 1, unitCostOrPrice: '10.00' },
        { productId: 'p3', quantity: 1, unitCostOrPrice: '10.00' },
      ],
      { type: 'FIXED', value: '1.00' },
    );

    expect(res.subtotal.toString()).toBe('30');
    expect(res.discountAmount.toString()).toBe('1');
    expect(res.lines[0]!.allocatedDiscount.toString()).toBe('0.34');
    expect(res.lines[1]!.allocatedDiscount.toString()).toBe('0.33');
    expect(res.lines[2]!.allocatedDiscount.toString()).toBe('0.33');

    // Total allocated equals header discount exactly
    const allocatedSum = res.lines.reduce((acc, l) => acc.add(l.allocatedDiscount), new Prisma.Decimal(0));
    expect(allocatedSum.toString()).toBe('1');

    // Total amount = 30 - 1 = 29
    expect(res.totalAmount.toString()).toBe('29');
    const lineTotalSum = res.lines.reduce((acc, l) => acc.add(l.lineTotal), new Prisma.Decimal(0));
    expect(lineTotalSum.toString()).toBe('29');
  });

  it('applies percentage header discount and line tax rates (BR-CALC-04, 07, 08)', () => {
    const res = calculateDocumentTotals(
      [
        { productId: 'p1', quantity: 10, unitCostOrPrice: '10.00', taxRate: '10' },
        { productId: 'p2', quantity: 5, unitCostOrPrice: '20.00', taxRate: '5' },
      ],
      { type: 'PERCENTAGE', value: '10' },
    );

    expect(res.subtotal.toString()).toBe('200');
    expect(res.discountAmount.toString()).toBe('20');
    expect(res.taxAmount.toString()).toBe('13.5');
    expect(res.totalAmount.toString()).toBe('193.5');

    expect(res.lines[0]!.lineTotal.toString()).toBe('99');
    expect(res.lines[1]!.lineTotal.toString()).toBe('94.5');

    // Net unit cost (excl tax): Line 1 = 90 / 10 = 9.0000; Line 2 = 90 / 5 = 18.0000
    expect(res.lines[0]!.netUnitCost.toString()).toBe('9');
    expect(res.lines[1]!.netUnitCost.toString()).toBe('18');
  });

  it('rejects invalid inputs with descriptive businessRule errors', () => {
    // Empty lines
    expect(() => calculateDocumentTotals([])).toThrowError(/At least one line item is required/);

    // Negative quantity
    expect(() =>
      calculateDocumentTotals([{ productId: 'p1', quantity: -1, unitCostOrPrice: '10.00' }]),
    ).toThrowError(/positive integer/);

    // Line discount exceeds gross
    expect(() =>
      calculateDocumentTotals([
        { productId: 'p1', quantity: 1, unitCostOrPrice: '10.00', lineDiscount: '15.00' },
      ]),
    ).toThrowError(/cannot exceed line gross/);

    // Fixed discount exceeds subtotal
    expect(() =>
      calculateDocumentTotals([{ productId: 'p1', quantity: 1, unitCostOrPrice: '10.00' }], {
        type: 'FIXED',
        value: '15.00',
      }),
    ).toThrowError(/cannot exceed document subtotal/);

    // Percentage discount > 100
    expect(() =>
      calculateDocumentTotals([{ productId: 'p1', quantity: 1, unitCostOrPrice: '10.00' }], {
        type: 'PERCENTAGE',
        value: '105',
      }),
    ).toThrowError(/cannot exceed 100%/);
  });
});
