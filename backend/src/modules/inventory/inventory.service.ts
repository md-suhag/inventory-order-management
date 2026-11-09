import { Prisma, type AdjustmentReason, type InventoryMovementType } from '@prisma/client';
import type { Tx } from '../../common/db/transaction';
import { businessRule, notFound } from '../../common/errors/app-error';

/**
 * The only code path that changes `products.stock_quantity` (BR-INV-01). Every call writes exactly
 * one `inventory_movements` row in the caller's transaction and applies weighted-average cost
 * (BR-INV-05). Callers touching several products must call this in ascending product-id order
 * (lock order: document header first, then products sorted by id).
 */

const INBOUND: ReadonlySet<InventoryMovementType> = new Set([
  'OPENING_STOCK',
  'PURCHASE_RECEIPT',
  'SALE_CANCELLATION',
  'SALE_RETURN',
  'ADJUSTMENT_IN',
]);

/** Inbound types whose cost feeds the weighted average; ADJUSTMENT_IN enters at the current cost. */
const COSTED_INBOUND: ReadonlySet<InventoryMovementType> = new Set([
  'OPENING_STOCK',
  'PURCHASE_RECEIPT',
  'SALE_CANCELLATION',
  'SALE_RETURN',
]);

export interface MovementInput {
  productId: string;
  type: InventoryMovementType;
  /** Positive magnitude; the sign is derived from the type. */
  quantity: number;
  /** Required for costed inbound movements; ignored otherwise (the current cost is recorded). */
  unitCost?: Prisma.Decimal;
  performedById: string;
  purchaseReceiptId?: string;
  orderId?: string;
  salesReturnId?: string;
  adjustmentReason?: AdjustmentReason;
  notes?: string | null;
  idempotencyKey?: string;
}

export interface MovementResult {
  movementId: string;
  previousStock: number;
  resultingStock: number;
  costPrice: Prisma.Decimal;
}

/** Weighted-average cost, rounded to 4 decimals; the first stock simply takes the inbound cost. */
export function weightedAverageCost(
  oldQty: number,
  oldCost: Prisma.Decimal,
  inQty: number,
  inCost: Prisma.Decimal,
): Prisma.Decimal {
  if (oldQty <= 0) return inCost.toDecimalPlaces(4);
  return oldCost
    .mul(oldQty)
    .add(inCost.mul(inQty))
    .div(oldQty + inQty)
    .toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
}

export async function applyMovement(tx: Tx, input: MovementInput): Promise<MovementResult> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error(`Invalid movement quantity: ${input.quantity}`);
  }
  const [product] = await tx.$queryRaw<{ stock_quantity: number; cost_price: Prisma.Decimal }[]>`
    SELECT stock_quantity, cost_price FROM products WHERE id = ${input.productId}::uuid FOR UPDATE`;
  if (!product) throw notFound('Product');

  const inbound = INBOUND.has(input.type);
  const change = inbound ? input.quantity : -input.quantity;
  const previousStock = product.stock_quantity;
  const resultingStock = previousStock + change;
  if (resultingStock < 0) {
    throw businessRule(`Insufficient stock: ${previousStock} available, ${input.quantity} requested`, [
      { field: 'quantity', message: 'Exceeds available stock' },
    ]);
  }

  const currentCost = new Prisma.Decimal(product.cost_price);
  let unitCost = currentCost;
  let costPrice = currentCost;
  if (COSTED_INBOUND.has(input.type)) {
    if (!input.unitCost) throw new Error(`${input.type} movement requires a unit cost`);
    unitCost = input.unitCost;
    costPrice =
      input.type === 'OPENING_STOCK'
        ? input.unitCost.toDecimalPlaces(4)
        : weightedAverageCost(previousStock, currentCost, input.quantity, input.unitCost);
  }

  await tx.product.update({
    where: { id: input.productId },
    data: { stockQuantity: resultingStock, costPrice },
  });
  const movement = await tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      type: input.type,
      quantityChange: change,
      previousStock,
      resultingStock,
      unitCost,
      purchaseReceiptId: input.purchaseReceiptId,
      orderId: input.orderId,
      salesReturnId: input.salesReturnId,
      adjustmentReason: input.adjustmentReason,
      notes: input.notes ?? null,
      idempotencyKey: input.idempotencyKey,
      performedById: input.performedById,
    },
    select: { id: true },
  });
  return { movementId: movement.id, previousStock, resultingStock, costPrice };
}
