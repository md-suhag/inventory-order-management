import { Prisma } from '@prisma/client';
import { businessRule } from '../errors/app-error';

export interface CalculationLineInput {
  productId: string;
  quantity: number;
  unitCostOrPrice: Prisma.Decimal | string | number;
  lineDiscount?: Prisma.Decimal | string | number | null;
  taxRate?: Prisma.Decimal | string | number | null;
}

export interface HeaderDiscountInput {
  type: 'FIXED' | 'PERCENTAGE';
  value: Prisma.Decimal | string | number;
}

export interface CalculatedLine {
  productId: string;
  quantity: number;
  unitCostOrPrice: Prisma.Decimal;
  gross: Prisma.Decimal;
  lineDiscount: Prisma.Decimal;
  allocatedDiscount: Prisma.Decimal;
  taxable: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  /** Net cost basis per unit (taxable / quantity), rounded to 4 decimals (BR-INV-05) */
  netUnitCost: Prisma.Decimal;
}

export interface CalculatedDocument {
  subtotal: Prisma.Decimal;
  discountType: 'FIXED' | 'PERCENTAGE' | null;
  discountValue: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  lines: CalculatedLine[];
}

function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function round4(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

function toDecimal(v: Prisma.Decimal | string | number | null | undefined, defaultValue = 0): Prisma.Decimal {
  if (v === null || v === undefined) return new Prisma.Decimal(defaultValue);
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

/**
 * Calculates document totals and line allocations according to BR-CALC-01..09.
 * Pure function with no database dependencies.
 */
export function calculateDocumentTotals(
  linesInput: CalculationLineInput[],
  headerDiscount?: HeaderDiscountInput | null,
): CalculatedDocument {
  if (linesInput.length === 0) {
    throw businessRule('At least one line item is required', [{ field: 'items', message: 'Must not be empty' }]);
  }

  // 1. Initial line validations and gross / line net calculations
  interface PreLine {
    productId: string;
    quantity: number;
    unitCostOrPrice: Prisma.Decimal;
    gross: Prisma.Decimal;
    lineDiscount: Prisma.Decimal;
    lineNetBeforeHeader: Prisma.Decimal;
    taxRate: Prisma.Decimal;
    index: number;
  }

  const preLines: PreLine[] = [];
  let subtotal = new Prisma.Decimal(0);

  for (let i = 0; i < linesInput.length; i++) {
    const item = linesInput[i]!;
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw businessRule(`Quantity for line ${i + 1} must be a positive integer`, [
        { field: `items.${i}.quantity`, message: 'Must be a positive integer' },
      ]);
    }
    const unitCostOrPrice = round2(toDecimal(item.unitCostOrPrice));
    if (unitCostOrPrice.isNegative()) {
      throw businessRule(`Unit price/cost for line ${i + 1} cannot be negative`, [
        { field: `items.${i}.unitCost`, message: 'Must be non-negative' },
      ]);
    }

    // BR-CALC-01: gross = quantity * unit
    const gross = round2(unitCostOrPrice.mul(item.quantity));

    // BR-CALC-02: 0 <= line_discount <= gross
    const lineDiscount = round2(toDecimal(item.lineDiscount, 0));
    if (lineDiscount.isNegative() || lineDiscount.greaterThan(gross)) {
      throw businessRule(`Line discount on line ${i + 1} cannot exceed line gross amount`, [
        { field: `items.${i}.discountAmount`, message: 'Must be between 0 and line gross' },
      ]);
    }

    const lineNetBeforeHeader = gross.sub(lineDiscount);
    subtotal = subtotal.add(lineNetBeforeHeader);

    const taxRate = toDecimal(item.taxRate, 0).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
    if (taxRate.isNegative() || taxRate.greaterThan(100)) {
      throw businessRule(`Tax rate on line ${i + 1} must be between 0 and 100`, [
        { field: `items.${i}.taxRate`, message: 'Must be between 0 and 100' },
      ]);
    }

    preLines.push({
      productId: item.productId,
      quantity: item.quantity,
      unitCostOrPrice,
      gross,
      lineDiscount,
      lineNetBeforeHeader,
      taxRate,
      index: i,
    });
  }

  // BR-CALC-03: subtotal = Σ (gross_i - line_discount_i)
  subtotal = round2(subtotal);

  // BR-CALC-04: Header discount
  let discountType: 'FIXED' | 'PERCENTAGE' | null = null;
  let discountValue: Prisma.Decimal | null = null;
  let discountAmount = new Prisma.Decimal(0);

  if (headerDiscount && headerDiscount.value !== undefined && headerDiscount.value !== null) {
    const val = toDecimal(headerDiscount.value);
    if (val.isNegative()) {
      throw businessRule('Discount value cannot be negative', [
        { field: 'discountValue', message: 'Must be non-negative' },
      ]);
    }

    discountType = headerDiscount.type;
    discountValue = val;

    if (discountType === 'FIXED') {
      discountAmount = round2(val);
      if (discountAmount.greaterThan(subtotal)) {
        throw businessRule('Fixed discount cannot exceed document subtotal', [
          { field: 'discountValue', message: 'Discount exceeds subtotal' },
        ]);
      }
    } else if (discountType === 'PERCENTAGE') {
      if (val.greaterThan(100)) {
        throw businessRule('Percentage discount cannot exceed 100%', [
          { field: 'discountValue', message: 'Percentage cannot exceed 100' },
        ]);
      }
      discountAmount = round2(subtotal.mul(val).div(100));
    }
  }

  // BR-CALC-05: Allocate header discount using Largest-Remainder Method on cents
  const totalDiscountCents = discountAmount.mul(100).toNumber();
  const allocatedCents = new Array<number>(preLines.length).fill(0);

  if (totalDiscountCents > 0 && subtotal.greaterThan(0)) {
    const remainders: { index: number; remainder: number }[] = [];
    let allocatedSum = 0;

    for (let i = 0; i < preLines.length; i++) {
      const pl = preLines[i]!;
      // share = lineNetBeforeHeader / subtotal
      const exactCents = pl.lineNetBeforeHeader
        .mul(totalDiscountCents)
        .div(subtotal)
        .toNumber();
      const baseCents = Math.floor(exactCents);
      allocatedCents[i] = baseCents;
      allocatedSum += baseCents;
      remainders.push({ index: i, remainder: exactCents - baseCents });
    }

    const centsRemaining = totalDiscountCents - allocatedSum;
    // Sort descending by remainder, breaking ties by line index
    remainders.sort((a, b) => b.remainder - a.remainder || a.index - b.index);

    for (let i = 0; i < centsRemaining; i++) {
      const rem = remainders[i]!;
      const current = allocatedCents[rem.index] ?? 0;
      allocatedCents[rem.index] = current + 1;
    }
  }

  // BR-CALC-06..08: Calculate taxable, tax, lineTotal for each line
  const lines: CalculatedLine[] = [];
  let totalTax = new Prisma.Decimal(0);

  for (let i = 0; i < preLines.length; i++) {
    const pl = preLines[i]!;
    const cents = allocatedCents[i] ?? 0;
    const allocatedDiscount = round2(new Prisma.Decimal(cents).div(100));

    // BR-CALC-06: taxable = gross - lineDiscount - allocatedDiscount
    const taxable = round2(pl.lineNetBeforeHeader.sub(allocatedDiscount));

    // BR-CALC-07: tax = round2(taxable * taxRate / 100)
    const taxAmount = round2(taxable.mul(pl.taxRate).div(100));
    totalTax = totalTax.add(taxAmount);

    // BR-CALC-08: lineTotal = taxable + tax
    const lineTotal = round2(taxable.add(taxAmount));

    // netUnitCost for receiving / WAC (BR-INV-05): taxable / quantity rounded to 4 decimals
    const netUnitCost = round4(taxable.div(pl.quantity));

    lines.push({
      productId: pl.productId,
      quantity: pl.quantity,
      unitCostOrPrice: pl.unitCostOrPrice,
      gross: pl.gross,
      lineDiscount: pl.lineDiscount,
      allocatedDiscount,
      taxable,
      taxRate: pl.taxRate,
      taxAmount,
      lineTotal,
      netUnitCost,
    });
  }

  // BR-CALC-09: taxAmount = Σ tax_i; totalAmount = subtotal - discountAmount + taxAmount
  totalTax = round2(totalTax);
  const totalAmount = round2(subtotal.sub(discountAmount).add(totalTax));

  return {
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    taxAmount: totalTax,
    totalAmount,
    lines,
  };
}
