import { Prisma, type AdjustmentReason, type InventoryMovementType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withIdempotentTransaction, type Tx } from '../../common/db/transaction';
import { AppError, ErrorCode, businessRule, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { publicUserSelect } from '../users/users.presenter';
import {
  defaultLowStockThreshold,
  stockStateOf,
  stockStateWhere,
} from '../products/products.service';
import type { StockState } from '../products/products.schemas';
import type {
  CreateAdjustmentInput,
  InventorySortField,
  ListInventoryQuery,
  ListMovementsQuery,
  MovementSortField,
} from './inventory.schemas';

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

// -----------------------------------------------------------------------------
// Inventory Overview & Movement Queries
// -----------------------------------------------------------------------------

export interface Viewer {
  canViewCost: boolean;
}

export interface InventoryProductItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  status: string;
  category: { id: string; name: string } | null;
  stockQuantity: number;
  reorderLevel: number | null;
  lowStockThreshold: number;
  stockState: StockState;
  costPrice?: string;
  stockValue?: string;
}

export interface MovementListItem {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  type: InventoryMovementType;
  quantityChange: number;
  previousStock: number;
  resultingStock: number;
  unitCost?: string;
  referenceNumber: string | null;
  adjustmentReason: AdjustmentReason | null;
  notes: string | null;
  performedBy: unknown;
  createdAt: Date;
}

export interface AdjustmentResult {
  replayed: boolean;
  movement: MovementListItem;
}

export async function listInventory(
  query: ListInventoryQuery,
  viewer: Viewer,
): Promise<Paginated<InventoryProductItem>> {
  const threshold = await defaultLowStockThreshold();

  const extraWhere: Prisma.ProductWhereInput[] = [];
  if (query.categoryId) extraWhere.push({ categoryId: query.categoryId });
  if (query.status) extraWhere.push({ status: { in: query.status } });
  if (query.stockState && query.stockState.length > 0) {
    extraWhere.push({
      OR: query.stockState.map((state) => stockStateWhere(state, threshold)),
    });
  }

  const args = buildListArgs<InventorySortField, Prisma.ProductWhereInput, Prisma.ProductOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'sku', 'barcode'],
      sortFields: {
        name: 'name',
        sku: 'sku',
        stockQuantity: 'stockQuantity',
        createdAt: 'createdAt',
      },
      defaultSort: [{ field: 'name', direction: 'asc' }],
    },
    extraWhere,
  );

  const page = await paginate(
    query,
    () =>
      prisma.product.findMany({
        ...args,
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          status: true,
          stockQuantity: true,
          reorderLevel: true,
          costPrice: true,
          category: { select: { id: true, name: true } },
        },
      }),
    () => prisma.product.count({ where: args.where }),
  );

  return {
    ...page,
    data: page.data.map((r) => {
      const lowStockThreshold = r.reorderLevel ?? threshold;
      const stockState = stockStateOf(r.stockQuantity, lowStockThreshold);
      const cost = new Prisma.Decimal(r.costPrice);
      const stockVal = cost.mul(r.stockQuantity).toFixed(2);

      return {
        id: r.id,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        status: r.status,
        category: r.category,
        stockQuantity: r.stockQuantity,
        reorderLevel: r.reorderLevel,
        lowStockThreshold,
        stockState,
        ...(viewer.canViewCost
          ? {
              costPrice: cost.toFixed(4),
              stockValue: stockVal,
            }
          : {}),
      };
    }),
  };
}

export async function getLowStock(viewer: Viewer): Promise<InventoryProductItem[]> {
  const threshold = await defaultLowStockThreshold();
  const where: Prisma.ProductWhereInput = {
    status: 'ACTIVE',
    ...stockStateWhere('LOW', threshold),
  };

  const rows = await prisma.product.findMany({
    where,
    select: {
      id: true,
      sku: true,
      name: true,
      unit: true,
      status: true,
      stockQuantity: true,
      reorderLevel: true,
      costPrice: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { stockQuantity: 'asc' },
  });

  return rows.map((r) => {
    const lowStockThreshold = r.reorderLevel ?? threshold;
    const cost = new Prisma.Decimal(r.costPrice);
    return {
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      status: r.status,
      category: r.category,
      stockQuantity: r.stockQuantity,
      reorderLevel: r.reorderLevel,
      lowStockThreshold,
      stockState: 'LOW',
      ...(viewer.canViewCost
        ? {
            costPrice: cost.toFixed(4),
            stockValue: cost.mul(r.stockQuantity).toFixed(2),
          }
        : {}),
    };
  });
}

function formatMovement(
  m: Prisma.InventoryMovementGetPayload<{
    include: {
      product: { select: { name: true; sku: true } };
      performedBy: { select: typeof publicUserSelect };
      purchaseReceipt: { select: { receiptNumber: true } };
      order: { select: { orderNumber: true } };
    };
  }>,
  viewer: Viewer,
): MovementListItem {
  const referenceNumber =
    m.purchaseReceipt?.receiptNumber ??
    m.order?.orderNumber ??
    null;

  return {
    id: m.id,
    productId: m.productId,
    productName: m.product.name,
    productSku: m.product.sku,
    type: m.type,
    quantityChange: m.quantityChange,
    previousStock: m.previousStock,
    resultingStock: m.resultingStock,
    ...(viewer.canViewCost && m.unitCost !== null
      ? { unitCost: new Prisma.Decimal(m.unitCost).toFixed(4) }
      : {}),
    referenceNumber,
    adjustmentReason: m.adjustmentReason,
    notes: m.notes,
    performedBy: m.performedBy,
    createdAt: m.createdAt,
  };
}

async function findReplayedAdjustment(
  db: Tx | typeof prisma,
  input: CreateAdjustmentInput,
  viewer: Viewer,
  idempotencyKey: string,
): Promise<AdjustmentResult | null> {
  const existing = await db.inventoryMovement.findUnique({
    where: { idempotencyKey },
    include: {
      product: { select: { name: true, sku: true } },
      performedBy: { select: publicUserSelect },
      purchaseReceipt: { select: { receiptNumber: true } },
      order: { select: { orderNumber: true } },
    },
  });
  if (!existing) return null;

  const expectedType = input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
  const expectedChange = input.direction === 'IN' ? input.quantity : -input.quantity;

  const isMatch =
    existing.productId === input.productId &&
    existing.type === expectedType &&
    existing.quantityChange === expectedChange &&
    existing.adjustmentReason === input.reason;

  if (!isMatch) {
    throw new AppError(
      422,
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      'Idempotency key was already used with a different request payload',
    );
  }

  return {
    replayed: true,
    movement: formatMovement(existing, viewer),
  };
}

export async function createAdjustment(
  input: CreateAdjustmentInput,
  ctx: RequestContext,
  viewer: Viewer,
  idempotencyKey?: string,
): Promise<AdjustmentResult> {
  return withIdempotentTransaction(
    async (tx) => {
      // 1. Idempotency replay check (BR-IDEM-01)
      if (idempotencyKey) {
        const replayed = await findReplayedAdjustment(tx, input, viewer, idempotencyKey);
        if (replayed) return replayed;
      }

      const movementType: InventoryMovementType =
        input.direction === 'IN' ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';

      const result = await applyMovement(tx, {
        productId: input.productId,
        type: movementType,
        quantity: input.quantity,
        performedById: ctx.actorId!,
        adjustmentReason: input.reason,
        notes: input.notes,
        idempotencyKey,
      });

      await recordAudit(tx, ctx, {
        action: 'inventory.adjusted',
        entityType: 'inventory_movement',
        entityId: result.movementId,
        metadata: {
          productId: input.productId,
          direction: input.direction,
          quantity: input.quantity,
          reason: input.reason,
          previousStock: result.previousStock,
          resultingStock: result.resultingStock,
        },
      });

      const movement = await tx.inventoryMovement.findUnique({
        where: { id: result.movementId },
        include: {
          product: { select: { name: true, sku: true } },
          performedBy: { select: publicUserSelect },
          purchaseReceipt: { select: { receiptNumber: true } },
          order: { select: { orderNumber: true } },
        },
      });

      return {
        replayed: false,
        movement: formatMovement(movement!, viewer),
      };
    },
    {
      idempotencyKey,
      onReplay: () =>
        idempotencyKey ? findReplayedAdjustment(prisma, input, viewer, idempotencyKey) : Promise.resolve(null),
    },
  );
}

export async function listMovements(
  query: ListMovementsQuery,
  viewer: Viewer,
): Promise<Paginated<MovementListItem>> {
  const extraWhere: Prisma.InventoryMovementWhereInput[] = [];
  if (query.productId) extraWhere.push({ productId: query.productId });
  if (query.type) extraWhere.push({ type: { in: query.type } });
  if (query.performedById) extraWhere.push({ performedById: query.performedById });

  if (query.from || query.to) {
    extraWhere.push({
      createdAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const args = buildListArgs<MovementSortField, Prisma.InventoryMovementWhereInput, Prisma.InventoryMovementOrderByWithRelationInput>(
    query,
    {
      searchFields: [],
      sortFields: {
        createdAt: 'createdAt',
        quantityChange: 'quantityChange',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    extraWhere,
  );

  const page = await paginate(
    query,
    () =>
      prisma.inventoryMovement.findMany({
        ...args,
        include: {
          product: { select: { name: true, sku: true } },
          performedBy: { select: publicUserSelect },
          purchaseReceipt: { select: { receiptNumber: true } },
          order: { select: { orderNumber: true } },
        },
      }),
    () => prisma.inventoryMovement.count({ where: args.where }),
  );

  return {
    ...page,
    data: page.data.map((m) => formatMovement(m, viewer)),
  };
}

export async function getMovement(id: string, viewer: Viewer): Promise<MovementListItem> {
  const movement = await prisma.inventoryMovement.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, sku: true } },
      performedBy: { select: publicUserSelect },
      purchaseReceipt: { select: { receiptNumber: true } },
      order: { select: { orderNumber: true } },
    },
  });

  if (!movement) throw notFound('Inventory movement');
  return formatMovement(movement, viewer);
}
