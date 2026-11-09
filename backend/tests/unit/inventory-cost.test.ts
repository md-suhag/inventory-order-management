import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { weightedAverageCost } from '../../src/modules/inventory/inventory.service';
import { stockStateOf } from '../../src/modules/products/products.service';
import { createProductSchema, updateProductSchema } from '../../src/modules/products/products.schemas';

const d = (v: string) => new Prisma.Decimal(v);

describe('weightedAverageCost (BR-INV-05)', () => {
  it('takes the inbound cost when there is no stock', () => {
    expect(weightedAverageCost(0, d('5'), 10, d('7.12345')).toString()).toBe('7.1235');
  });

  it('averages by quantity and rounds to 4 decimals', () => {
    // (10 × 5 + 20 × 8) / 30 = 7
    expect(weightedAverageCost(10, d('5'), 20, d('8')).toString()).toBe('7');
    // (3 × 1 + 1 × 2) / 4 = 1.25 ; (1 × 1 + 2 × 1.0001) / 3 = 1.000066… → 1.0001
    expect(weightedAverageCost(3, d('1'), 1, d('2')).toString()).toBe('1.25');
    expect(weightedAverageCost(1, d('1'), 2, d('1.0001')).toString()).toBe('1.0001');
  });
});

describe('stockStateOf (BR-PROD-04)', () => {
  it.each([
    [0, 10, 'OUT'],
    [1, 10, 'LOW'],
    [10, 10, 'LOW'],
    [11, 10, 'IN_STOCK'],
    [1, 0, 'IN_STOCK'],
  ])('stock %i with threshold %i → %s', (stock, threshold, state) => {
    expect(stockStateOf(stock, threshold)).toBe(state);
  });
});

describe('product input schemas', () => {
  const base = { sku: ' ab-1 ', name: 'Tea', sellingPrice: '10.50' };

  it('normalises the SKU and accepts numeric or string prices', () => {
    const parsed = createProductSchema.parse({ ...base, costPrice: 4.1234, taxRate: '15' });
    expect(parsed).toMatchObject({ sku: 'AB-1', costPrice: '4.1234', sellingPrice: '10.50', taxRate: '15' });
  });

  it.each([
    ['negative price', { sellingPrice: '-1' }],
    ['too many decimals', { sellingPrice: '1.234' }],
    ['tax above 100', { taxRate: '100.5' }],
    ['sku with spaces', { sku: 'A B' }],
    ['fractional opening stock', { openingStock: 1.5 }],
  ])('rejects %s', (_label, patch) => {
    expect(createProductSchema.safeParse({ ...base, ...patch }).success).toBe(false);
  });

  it('rejects direct stock edits on update (BR-INV-01)', () => {
    expect(updateProductSchema.safeParse({ stockQuantity: 5 }).success).toBe(false);
  });
});
