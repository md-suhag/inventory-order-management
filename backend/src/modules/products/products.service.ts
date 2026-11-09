import { Prisma, type ProductStatus } from '@prisma/client';
import { prisma, type Db } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { isUniqueViolation } from '../../common/errors/db-errors';
import { AppError, ErrorCode, conflict, forbidden, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { applyMovement } from '../inventory/inventory.service';
import type {
  CreateProductInput,
  ListProductsQuery,
  ProductSortField,
  StockState,
  UpdateProductInput,
} from './products.schemas';

/** What the caller may see; cost data requires `products.view_cost` (FR-PROD-06). */
export interface Viewer {
  canViewCost: boolean;
}

const productSelect = {
  id: true,
  sku: true,
  barcode: true,
  name: true,
  description: true,
  unit: true,
  costPrice: true,
  sellingPrice: true,
  taxRate: true,
  stockQuantity: true,
  reorderLevel: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, status: true } },
  images: { select: { id: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 1 },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

export interface ProductView extends Omit<ProductRow, 'costPrice' | 'images'> {
  costPrice?: Prisma.Decimal;
  stockState: StockState;
  /** Effective threshold: own reorder level or the business default (BR-PROD-04). */
  lowStockThreshold: number;
  primaryImageId: string | null;
}

export async function defaultLowStockThreshold(db: Db = prisma): Promise<number> {
  const settings = await db.businessSetting.findUnique({ where: { id: 1 }, select: { defaultLowStockThreshold: true } });
  return settings?.defaultLowStockThreshold ?? 10;
}

export function stockStateOf(stock: number, threshold: number): StockState {
  if (stock <= 0) return 'OUT';
  return stock <= threshold ? 'LOW' : 'IN_STOCK';
}

function present({ costPrice, images, ...row }: ProductRow, viewer: Viewer, defaultThreshold: number): ProductView {
  const lowStockThreshold = row.reorderLevel ?? defaultThreshold;
  return {
    ...row,
    ...(viewer.canViewCost ? { costPrice } : {}),
    stockState: stockStateOf(row.stockQuantity, lowStockThreshold),
    lowStockThreshold,
    primaryImageId: images[0]?.id ?? null,
  };
}

/** Prisma filter for BR-PROD-04 stock states (column-to-column comparison via field references). */
export function stockStateWhere(state: StockState, defaultThreshold: number): Prisma.ProductWhereInput {
  const reorder = prisma.product.fields.reorderLevel;
  switch (state) {
    case 'OUT':
      return { stockQuantity: 0 };
    case 'LOW':
      return {
        stockQuantity: { gt: 0 },
        OR: [
          { reorderLevel: { not: null }, stockQuantity: { lte: reorder } },
          { reorderLevel: null, stockQuantity: { lte: defaultThreshold } },
        ],
      };
    case 'IN_STOCK':
      return {
        stockQuantity: { gt: 0 },
        OR: [
          { reorderLevel: { not: null }, stockQuantity: { gt: reorder } },
          { reorderLevel: null, stockQuantity: { gt: defaultThreshold } },
        ],
      };
  }
}

export async function listProducts(query: ListProductsQuery, viewer: Viewer): Promise<Paginated<ProductView>> {
  const threshold = await defaultLowStockThreshold();
  const args = buildListArgs<ProductSortField, Prisma.ProductWhereInput, Prisma.ProductOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'sku', 'barcode'],
      sortFields: {
        name: 'name',
        sku: 'sku',
        sellingPrice: 'sellingPrice',
        stockQuantity: 'stockQuantity',
        createdAt: 'createdAt',
      },
      defaultSort: [{ field: 'name', direction: 'asc' }],
    },
    [
      query.status ? { status: { in: query.status } } : undefined,
      query.categoryId ? { categoryId: query.categoryId } : undefined,
      query.stockState ? { OR: query.stockState.map((s) => stockStateWhere(s, threshold)) } : undefined,
    ],
  );
  const page = await paginate(
    query,
    () => prisma.product.findMany({ ...args, select: productSelect }),
    () => prisma.product.count({ where: args.where }),
  );
  return { ...page, data: page.data.map((row) => present(row, viewer, threshold)) };
}

const RECENT_MOVEMENTS = 10;

export async function getProduct(id: string, viewer: Viewer) {
  const [row, threshold] = await Promise.all([
    prisma.product.findUnique({ where: { id }, select: productSelect }),
    defaultLowStockThreshold(),
  ]);
  if (!row) throw notFound('Product');
  const [images, movements] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId: id },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true, sortOrder: true, createdAt: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.inventoryMovement.findMany({
      where: { productId: id },
      select: {
        id: true,
        type: true,
        quantityChange: true,
        previousStock: true,
        resultingStock: true,
        unitCost: true,
        adjustmentReason: true,
        notes: true,
        createdAt: true,
        performedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: RECENT_MOVEMENTS,
    }),
  ]);
  return {
    ...present(row, viewer, threshold),
    images,
    recentMovements: viewer.canViewCost ? movements : movements.map(({ unitCost: _unitCost, ...m }) => m),
  };
}

// ---------------------------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------------------------

const duplicate = (field: 'sku' | 'barcode') =>
  conflict(`A product with this ${field} already exists`, ErrorCode.DUPLICATE, [{ field, message: 'Must be unique' }]);

async function withDuplicateMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err, 'sku')) throw duplicate('sku');
    if (isUniqueViolation(err, 'barcode')) throw duplicate('barcode');
    throw err;
  }
}

async function assertUnique(tx: Tx, input: { sku?: string; barcode?: string | null }, exceptId?: string) {
  const not = exceptId ? { id: { not: exceptId } } : {};
  if (input.sku && (await tx.product.findFirst({ where: { sku: input.sku, ...not }, select: { id: true } }))) {
    throw duplicate('sku');
  }
  if (input.barcode && (await tx.product.findFirst({ where: { barcode: input.barcode, ...not }, select: { id: true } }))) {
    throw duplicate('barcode');
  }
}

/** Archived categories cannot be assigned (FR-CAT-04). FOR SHARE blocks a concurrent archive/delete. */
async function assertAssignableCategory(tx: Tx, categoryId: string): Promise<void> {
  const [category] = await tx.$queryRaw<{ status: string }[]>`
    SELECT status FROM categories WHERE id = ${categoryId}::uuid FOR SHARE`;
  if (!category) throw invalidReference('categoryId', 'Category does not exist');
  if (category.status !== 'ACTIVE') throw invalidReference('categoryId', 'Category is archived');
}

function assertCanSetCost(input: { costPrice?: string }, viewer: Viewer): void {
  if (input.costPrice !== undefined && !viewer.canViewCost) {
    throw forbidden('Setting the cost price requires the products.view_cost permission');
  }
}

async function lockProduct(tx: Tx, id: string): Promise<ProductRow> {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.product.findUnique({ where: { id }, select: productSelect });
  if (!row) throw notFound('Product');
  return row;
}

export function createProduct(input: CreateProductInput, ctx: RequestContext, viewer: Viewer): Promise<ProductView> {
  assertCanSetCost(input, viewer);
  return withDuplicateMapping(() =>
    withTransaction(async (tx) => {
      await assertUnique(tx, input);
      if (input.categoryId) await assertAssignableCategory(tx, input.categoryId);
      const costPrice = input.costPrice ?? '0';
      const created = await tx.product.create({
        data: {
          sku: input.sku,
          barcode: input.barcode ?? null,
          name: input.name,
          description: input.description ?? null,
          categoryId: input.categoryId ?? null,
          unit: input.unit ?? 'pcs',
          costPrice,
          sellingPrice: input.sellingPrice,
          taxRate: input.taxRate ?? null,
          reorderLevel: input.reorderLevel ?? null,
          status: input.status ?? 'ACTIVE',
        },
        select: { id: true },
      });
      if (input.openingStock) {
        await applyMovement(tx, {
          productId: created.id,
          type: 'OPENING_STOCK',
          quantity: input.openingStock,
          unitCost: new Prisma.Decimal(costPrice),
          performedById: ctx.actorId!,
        });
      }
      await recordAudit(tx, ctx, {
        action: 'product.created',
        entityType: 'product',
        entityId: created.id,
        metadata: { sku: input.sku, name: input.name, openingStock: input.openingStock ?? 0 },
      });
      const row = await tx.product.findUniqueOrThrow({ where: { id: created.id }, select: productSelect });
      return present(row, viewer, await defaultLowStockThreshold(tx));
    }),
  );
}

const AUDITED_FIELDS = [
  'sku',
  'barcode',
  'name',
  'description',
  'categoryId',
  'unit',
  'costPrice',
  'sellingPrice',
  'taxRate',
  'reorderLevel',
  'status',
] as const;

export function updateProduct(
  id: string,
  input: UpdateProductInput,
  ctx: RequestContext,
  viewer: Viewer,
): Promise<ProductView> {
  assertCanSetCost(input, viewer);
  return withDuplicateMapping(() =>
    withTransaction(async (tx) => {
      const before = await lockProduct(tx, id);
      if (input.status && before.status === 'ARCHIVED') {
        throw new AppError(409, ErrorCode.INVALID_STATE_TRANSITION, 'Unarchive the product before changing its status');
      }
      await assertUnique(
        tx,
        {
          sku: input.sku !== before.sku ? input.sku : undefined,
          barcode: input.barcode !== before.barcode ? input.barcode : undefined,
        },
        id,
      );
      if (input.categoryId && input.categoryId !== before.category?.id) {
        await assertAssignableCategory(tx, input.categoryId);
      }
      const row = await tx.product.update({ where: { id }, data: input, select: productSelect });
      const beforeFlat: Record<string, unknown> = { ...before, categoryId: before.category?.id ?? null };
      const changes = diffChanges(
        Object.fromEntries(AUDITED_FIELDS.map((k) => [k, beforeFlat[k]])),
        Object.fromEntries(AUDITED_FIELDS.map((k) => [k, input[k]])),
      );
      if (Object.keys(changes).length) {
        await recordAudit(tx, ctx, {
          action: 'product.updated',
          entityType: 'product',
          entityId: id,
          metadata: { changes } as Prisma.InputJsonValue,
        });
      }
      return present(row, viewer, await defaultLowStockThreshold(tx));
    }),
  );
}

/** Archive keeps history visible; only ACTIVE products can be used on new documents (BR-PROD-03). */
export function setArchived(id: string, archived: boolean, ctx: RequestContext, viewer: Viewer): Promise<ProductView> {
  const target: ProductStatus = archived ? 'ARCHIVED' : 'ACTIVE';
  return withTransaction(async (tx) => {
    const before = await lockProduct(tx, id);
    const threshold = await defaultLowStockThreshold(tx);
    if (archived ? before.status === 'ARCHIVED' : before.status !== 'ARCHIVED') return present(before, viewer, threshold);
    const row = await tx.product.update({ where: { id }, data: { status: target }, select: productSelect });
    await recordAudit(tx, ctx, {
      action: archived ? 'product.archived' : 'product.unarchived',
      entityType: 'product',
      entityId: id,
    });
    return present(row, viewer, threshold);
  });
}

/**
 * Hard delete only when the product was never referenced by a purchase, order or inventory movement
 * (BR-PROD-02); otherwise archive. Returns the stored image paths so the caller can remove the files
 * after the transaction commits.
 */
export async function deleteProduct(id: string, ctx: RequestContext): Promise<string[]> {
  return withTransaction(async (tx) => {
    const row = await lockProduct(tx, id);
    const [purchaseLines, orderLines, movements] = await Promise.all([
      tx.purchaseItem.count({ where: { productId: id } }),
      tx.orderItem.count({ where: { productId: id } }),
      tx.inventoryMovement.count({ where: { productId: id } }),
    ]);
    if (purchaseLines + orderLines + movements > 0) {
      throw conflict('Product has purchase, order or stock history; archive it instead', ErrorCode.REFERENCED);
    }
    const images = await tx.productImage.findMany({ where: { productId: id }, select: { filePath: true } });
    await tx.product.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: 'product.deleted',
      entityType: 'product',
      entityId: id,
      metadata: { sku: row.sku, name: row.name },
    });
    return images.map((i) => i.filePath);
  });
}
