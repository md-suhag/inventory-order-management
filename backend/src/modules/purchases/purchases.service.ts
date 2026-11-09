import { Prisma, type PaymentStatus, type PurchaseStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { AppError, ErrorCode, businessRule, conflict, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { calculateDocumentTotals } from '../../common/pricing/document-calculator';
import { nextDocumentNumber } from '../../common/sequence/document-sequence';
import { publicUserSelect } from '../users/users.presenter';
import { applyMovement } from '../inventory/inventory.service';
import type {
  CreatePurchaseInput,
  ListPurchasesQuery,
  PurchaseSortField,
  ReceiveGoodsInput,
  UpdatePurchaseInput,
} from './purchases.schemas';

export interface PurchaseItemDetail {
  id: string;
  productId: string;
  lineNo: number;
  productName: string;
  productSku: string;
  quantity: number;
  receivedQuantity: number;
  remainingQuantity: number;
  unitCost: string;
  discountAmount: string;
  allocatedDiscount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PurchaseReceiptItemDetail {
  id: string;
  purchaseItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitCost: string;
}

export interface PurchaseReceiptDetail {
  id: string;
  receiptNumber: string;
  receivedAt: Date;
  notes: string | null;
  idempotencyKey: string | null;
  receivedBy: unknown;
  items: PurchaseReceiptItemDetail[];
}

export interface PurchaseDetail {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  supplierReference: string | null;
  expectedDeliveryDate: string | null;
  subtotal: string;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  balanceDue: string;
  notes: string | null;
  orderedAt: Date | null;
  receivedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supplier: {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    status: string;
  };
  createdBy: unknown;
  items: PurchaseItemDetail[];
  receipts: PurchaseReceiptDetail[];
}

export interface PurchaseListItem {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  paymentStatus: PaymentStatus;
  supplierReference: string | null;
  expectedDeliveryDate: string | null;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  itemCount: number;
  orderedAt: Date | null;
  createdAt: Date;
}

export interface ReceiveGoodsResult {
  replayed: boolean;
  receipt: PurchaseReceiptDetail;
}

const purchaseItemSelect = {
  id: true,
  productId: true,
  lineNo: true,
  productName: true,
  productSku: true,
  quantity: true,
  receivedQuantity: true,
  unitCost: true,
  discountAmount: true,
  allocatedDiscount: true,
  taxRate: true,
  taxAmount: true,
  lineTotal: true,
} satisfies Prisma.PurchaseItemSelect;

function formatPurchaseDetail(
  p: Prisma.PurchaseGetPayload<{
    include: {
      supplier: { select: { id: true; name: true; contactPerson: true; phone: true; email: true; status: true } };
      createdBy: { select: typeof publicUserSelect };
      items: { select: typeof purchaseItemSelect };
      receipts: {
        include: {
          receivedBy: { select: typeof publicUserSelect };
          items: {
            include: {
              purchaseItem: { select: { productId: true; productName: true; productSku: true } };
            };
          };
        };
      };
    };
  }>,
): PurchaseDetail {
  const total = new Prisma.Decimal(p.totalAmount);
  const paid = new Prisma.Decimal(p.paidAmount);
  const refunded = new Prisma.Decimal(p.refundedAmount);
  const balanceDue = total.sub(paid).add(refunded).toFixed(2);

  return {
    id: p.id,
    purchaseNumber: p.purchaseNumber,
    supplierId: p.supplierId,
    status: p.status,
    paymentStatus: p.paymentStatus,
    supplierReference: p.supplierReference,
    expectedDeliveryDate: p.expectedDeliveryDate ? p.expectedDeliveryDate.toISOString().slice(0, 10) : null,
    subtotal: p.subtotal.toFixed(2),
    discountType: p.discountType,
    discountValue: p.discountValue ? p.discountValue.toFixed(4) : null,
    discountAmount: p.discountAmount.toFixed(2),
    taxAmount: p.taxAmount.toFixed(2),
    totalAmount: p.totalAmount.toFixed(2),
    paidAmount: p.paidAmount.toFixed(2),
    refundedAmount: p.refundedAmount.toFixed(2),
    balanceDue,
    notes: p.notes,
    orderedAt: p.orderedAt,
    receivedAt: p.receivedAt,
    cancelledAt: p.cancelledAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    supplier: p.supplier,
    createdBy: p.createdBy,
    items: p.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      lineNo: i.lineNo,
      productName: i.productName,
      productSku: i.productSku,
      quantity: i.quantity,
      receivedQuantity: i.receivedQuantity,
      remainingQuantity: i.quantity - i.receivedQuantity,
      unitCost: i.unitCost.toFixed(2),
      discountAmount: i.discountAmount.toFixed(2),
      allocatedDiscount: i.allocatedDiscount.toFixed(2),
      taxRate: i.taxRate.toFixed(4),
      taxAmount: i.taxAmount.toFixed(2),
      lineTotal: i.lineTotal.toFixed(2),
    })),
    receipts: p.receipts.map((r) => ({
      id: r.id,
      receiptNumber: r.receiptNumber,
      receivedAt: r.receivedAt,
      notes: r.notes,
      idempotencyKey: r.idempotencyKey,
      receivedBy: r.receivedBy,
      items: r.items.map((it) => ({
        id: it.id,
        purchaseItemId: it.purchaseItemId,
        productId: it.purchaseItem.productId,
        productName: it.purchaseItem.productName,
        productSku: it.purchaseItem.productSku,
        quantity: it.quantity,
        unitCost: it.unitCost.toFixed(4),
      })),
    })),
  };
}

async function validateAndCalculateLines(
  tx: Tx,
  items: {
    productId: string;
    quantity: number;
    unitCost: Prisma.Decimal | string | number;
    discountAmount?: Prisma.Decimal | string | number | null;
    taxRate?: Prisma.Decimal | string | number | null;
  }[],
  discountType?: 'FIXED' | 'PERCENTAGE' | null,
  discountValue?: string | number | Prisma.Decimal | null,
) {
  // Check duplicate product ids (BR-CALC-11)
  const productIds = items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw businessRule('Each product may appear only once per purchase', [
      { field: 'items', message: 'Duplicate product in items' },
    ]);
  }

  // Fetch products
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, status: true, taxRate: true },
  });
  if (products.length !== productIds.length) {
    throw invalidReference('items', 'One or more products do not exist');
  }

  const inactiveProducts = products.filter((p) => p.status !== 'ACTIVE');
  if (inactiveProducts.length > 0) {
    throw businessRule('Only ACTIVE products can be used on a purchase', [
      {
        field: 'items',
        message: `Inactive products: ${inactiveProducts.map((p) => p.sku).join(', ')}`,
      },
    ]);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));

  // Read business settings for tax
  const settings = await tx.businessSetting.findUnique({ where: { id: 1 } });
  const taxEnabled = settings?.taxEnabled ?? false;
  const defaultTaxRate = settings?.defaultTaxRate ?? new Prisma.Decimal(0);

  // Build inputs for calculation engine
  const calculationInputs = items.map((item) => {
    const product = productMap.get(item.productId)!;
    let resolvedTaxRate: Prisma.Decimal | string | number = 0;
    if (item.taxRate !== undefined && item.taxRate !== null) {
      resolvedTaxRate = item.taxRate;
    } else if (taxEnabled) {
      resolvedTaxRate = product.taxRate ?? defaultTaxRate;
    }

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCostOrPrice: item.unitCost,
      lineDiscount: item.discountAmount,
      taxRate: resolvedTaxRate,
    };
  });

  const calculationResult = calculateDocumentTotals(
    calculationInputs,
    discountType && discountValue ? { type: discountType, value: discountValue } : null,
  );

  return { calculationResult, productMap };
}

export async function createPurchase(input: CreatePurchaseInput, ctx: RequestContext): Promise<PurchaseDetail> {
  return withTransaction(async (tx) => {
    // Validate supplier
    const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw invalidReference('supplierId', 'Supplier not found');
    if (supplier.status !== 'ACTIVE') {
      throw businessRule('Supplier is not active', [
        { field: 'supplierId', message: 'Only active suppliers can receive purchases' },
      ]);
    }

    const { calculationResult, productMap } = await validateAndCalculateLines(
      tx,
      input.items,
      input.discountType,
      input.discountValue,
    );

    const purchaseNumber = await nextDocumentNumber(tx, 'PURCHASE');
    const expectedDeliveryDate = input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null;

    const purchase = await tx.purchase.create({
      data: {
        purchaseNumber,
        supplierId: input.supplierId,
        supplierReference: input.supplierReference,
        expectedDeliveryDate,
        notes: input.notes,
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        subtotal: calculationResult.subtotal,
        discountType: calculationResult.discountType,
        discountValue: calculationResult.discountValue,
        discountAmount: calculationResult.discountAmount,
        taxAmount: calculationResult.taxAmount,
        totalAmount: calculationResult.totalAmount,
        createdById: ctx.actorId!,
      },
    });

    for (let i = 0; i < calculationResult.lines.length; i++) {
      const line = calculationResult.lines[i]!;
      const product = productMap.get(line.productId)!;
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          productId: line.productId,
          lineNo: i + 1,
          productName: product.name,
          productSku: product.sku,
          quantity: line.quantity,
          receivedQuantity: 0,
          unitCost: line.unitCostOrPrice,
          discountAmount: line.lineDiscount,
          allocatedDiscount: line.allocatedDiscount,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        },
      });
    }

    await recordAudit(tx, ctx, {
      action: 'purchase.created',
      entityType: 'purchase',
      entityId: purchase.id,
      metadata: {
        purchaseNumber,
        supplierId: input.supplierId,
        totalAmount: calculationResult.totalAmount.toString(),
      },
    });

    return getPurchaseWithTx(tx, purchase.id);
  });
}

async function getPurchaseWithTx(tx: Tx, id: string): Promise<PurchaseDetail> {
  const purchase = await tx.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, contactPerson: true, phone: true, email: true, status: true } },
      createdBy: { select: publicUserSelect },
      items: {
        select: purchaseItemSelect,
        orderBy: { lineNo: 'asc' },
      },
      receipts: {
        include: {
          receivedBy: { select: publicUserSelect },
          items: {
            include: {
              purchaseItem: { select: { productId: true, productName: true, productSku: true } },
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
      },
    },
  });

  if (!purchase) throw notFound('Purchase');
  return formatPurchaseDetail(purchase);
}

export async function getPurchase(id: string): Promise<PurchaseDetail> {
  return getPurchaseWithTx(prisma, id);
}

export async function listPurchases(query: ListPurchasesQuery): Promise<Paginated<PurchaseListItem>> {
  const extraWhere: Prisma.PurchaseWhereInput[] = [];
  if (query.supplierId) extraWhere.push({ supplierId: query.supplierId });
  if (query.status) extraWhere.push({ status: { in: query.status } });
  if (query.paymentStatus) extraWhere.push({ paymentStatus: { in: query.paymentStatus } });

  if (query.from || query.to) {
    extraWhere.push({
      createdAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const args = buildListArgs<PurchaseSortField, Prisma.PurchaseWhereInput, Prisma.PurchaseOrderByWithRelationInput>(
    query,
    {
      searchFields: ['purchaseNumber', 'supplierReference'],
      sortFields: {
        purchaseNumber: 'purchaseNumber',
        createdAt: 'createdAt',
        orderedAt: 'orderedAt',
        totalAmount: 'totalAmount',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    extraWhere,
  );

  return paginate(
    query,
    async () => {
      const rows = await prisma.purchase.findMany({
        ...args,
        select: {
          id: true,
          purchaseNumber: true,
          supplierId: true,
          supplierReference: true,
          expectedDeliveryDate: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          paidAmount: true,
          refundedAmount: true,
          orderedAt: true,
          createdAt: true,
          supplier: { select: { name: true } },
          _count: { select: { items: true } },
        },
      });

      return rows.map((r) => {
        const total = new Prisma.Decimal(r.totalAmount);
        const paid = new Prisma.Decimal(r.paidAmount);
        const refunded = new Prisma.Decimal(r.refundedAmount);
        const balanceDue = total.sub(paid).add(refunded).toFixed(2);

        return {
          id: r.id,
          purchaseNumber: r.purchaseNumber,
          supplierId: r.supplierId,
          supplierName: r.supplier.name,
          status: r.status,
          paymentStatus: r.paymentStatus,
          supplierReference: r.supplierReference,
          expectedDeliveryDate: r.expectedDeliveryDate ? r.expectedDeliveryDate.toISOString().slice(0, 10) : null,
          totalAmount: total.toFixed(2),
          paidAmount: paid.toFixed(2),
          balanceDue,
          itemCount: r._count.items,
          orderedAt: r.orderedAt,
          createdAt: r.createdAt,
        };
      });
    },
    () => prisma.purchase.count({ where: args.where }),
  );
}

export async function updatePurchase(
  id: string,
  input: UpdatePurchaseInput,
  ctx: RequestContext,
): Promise<PurchaseDetail> {
  return withTransaction(async (tx) => {
    const existing = await tx.purchase.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!existing) throw notFound('Purchase');
    if (existing.status !== 'DRAFT') {
      throw conflict('Only DRAFT purchases can be edited', ErrorCode.INVALID_STATE_TRANSITION);
    }

    let supplierId = existing.supplierId;
    if (input.supplierId && input.supplierId !== existing.supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw invalidReference('supplierId', 'Supplier not found');
      if (supplier.status !== 'ACTIVE') {
        throw businessRule('Supplier is not active', [
          { field: 'supplierId', message: 'Only active suppliers can receive purchases' },
        ]);
      }
      supplierId = input.supplierId;
    }

    const discountType = input.discountType !== undefined ? input.discountType : existing.discountType;
    const discountValue = input.discountValue !== undefined ? input.discountValue : existing.discountValue;

    if (input.items) {
      const { calculationResult, productMap } = await validateAndCalculateLines(
        tx,
        input.items,
        discountType,
        discountValue,
      );

      // Replace items
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });

      for (let i = 0; i < calculationResult.lines.length; i++) {
        const line = calculationResult.lines[i]!;
        const product = productMap.get(line.productId)!;
        await tx.purchaseItem.create({
          data: {
            purchaseId: id,
            productId: line.productId,
            lineNo: i + 1,
            productName: product.name,
            productSku: product.sku,
            quantity: line.quantity,
            receivedQuantity: 0,
            unitCost: line.unitCostOrPrice,
            discountAmount: line.lineDiscount,
            allocatedDiscount: line.allocatedDiscount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
          },
        });
      }

      await tx.purchase.update({
        where: { id },
        data: {
          supplierId,
          supplierReference: input.supplierReference !== undefined ? input.supplierReference : existing.supplierReference,
          expectedDeliveryDate:
            input.expectedDeliveryDate !== undefined
              ? input.expectedDeliveryDate
                ? new Date(input.expectedDeliveryDate)
                : null
              : existing.expectedDeliveryDate,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          subtotal: calculationResult.subtotal,
          discountType: calculationResult.discountType,
          discountValue: calculationResult.discountValue,
          discountAmount: calculationResult.discountAmount,
          taxAmount: calculationResult.taxAmount,
          totalAmount: calculationResult.totalAmount,
        },
      });
    } else {
      // Recalculate with existing items if discount changed
      if (input.discountType !== undefined || input.discountValue !== undefined) {
        const itemsToRecalc = existing.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          discountAmount: it.discountAmount,
          taxRate: it.taxRate,
        }));
        const { calculationResult } = await validateAndCalculateLines(tx, itemsToRecalc, discountType, discountValue);

        // Update items allocated discounts and totals
        for (let i = 0; i < calculationResult.lines.length; i++) {
          const line = calculationResult.lines[i]!;
          await tx.purchaseItem.update({
            where: { purchaseId_productId: { purchaseId: id, productId: line.productId } },
            data: {
              allocatedDiscount: line.allocatedDiscount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            },
          });
        }

        await tx.purchase.update({
          where: { id },
          data: {
            supplierId,
            supplierReference: input.supplierReference !== undefined ? input.supplierReference : existing.supplierReference,
            expectedDeliveryDate:
              input.expectedDeliveryDate !== undefined
                ? input.expectedDeliveryDate
                  ? new Date(input.expectedDeliveryDate)
                  : null
                : existing.expectedDeliveryDate,
            notes: input.notes !== undefined ? input.notes : existing.notes,
            subtotal: calculationResult.subtotal,
            discountType: calculationResult.discountType,
            discountValue: calculationResult.discountValue,
            discountAmount: calculationResult.discountAmount,
            taxAmount: calculationResult.taxAmount,
            totalAmount: calculationResult.totalAmount,
          },
        });
      } else {
        await tx.purchase.update({
          where: { id },
          data: {
            supplierId,
            supplierReference: input.supplierReference !== undefined ? input.supplierReference : existing.supplierReference,
            expectedDeliveryDate:
              input.expectedDeliveryDate !== undefined
                ? input.expectedDeliveryDate
                  ? new Date(input.expectedDeliveryDate)
                  : null
                : existing.expectedDeliveryDate,
            notes: input.notes !== undefined ? input.notes : existing.notes,
          },
        });
      }
    }

    await recordAudit(tx, ctx, {
      action: 'purchase.updated',
      entityType: 'purchase',
      entityId: id,
    });

    return getPurchaseWithTx(tx, id);
  });
}

export async function deletePurchase(id: string, ctx: RequestContext): Promise<void> {
  return withTransaction(async (tx) => {
    const existing = await tx.purchase.findUnique({ where: { id } });
    if (!existing) throw notFound('Purchase');
    if (existing.status !== 'DRAFT') {
      throw conflict('Only DRAFT purchases can be deleted', ErrorCode.INVALID_STATE_TRANSITION);
    }

    await tx.purchase.delete({ where: { id } });

    await recordAudit(tx, ctx, {
      action: 'purchase.deleted',
      entityType: 'purchase',
      entityId: id,
      metadata: { purchaseNumber: existing.purchaseNumber },
    });
  });
}

export async function confirmPurchase(id: string, ctx: RequestContext): Promise<PurchaseDetail> {
  return withTransaction(async (tx) => {
    const [purchase] = await tx.$queryRaw<{ id: string; status: PurchaseStatus; supplier_id: string }[]>`
      SELECT id, status, supplier_id FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
    if (!purchase) throw notFound('Purchase');

    if (purchase.status !== 'DRAFT') {
      throw conflict('Purchase must be in DRAFT status to confirm', ErrorCode.INVALID_STATE_TRANSITION);
    }

    const supplier = await tx.supplier.findUnique({ where: { id: purchase.supplier_id } });
    if (!supplier || supplier.status !== 'ACTIVE') {
      throw businessRule('Supplier is not active', [
        { field: 'supplierId', message: 'Supplier must be active to confirm purchase' },
      ]);
    }

    const items = await tx.purchaseItem.findMany({
      where: { purchaseId: id },
      include: { product: { select: { id: true, sku: true, status: true } } },
    });
    if (items.length === 0) {
      throw businessRule('Purchase must contain at least one item to confirm');
    }

    const inactive = items.filter((i) => i.product.status !== 'ACTIVE');
    if (inactive.length > 0) {
      throw businessRule(
        `Inactive products cannot be confirmed: ${inactive.map((i) => i.product.sku).join(', ')}`,
      );
    }

    await tx.purchase.update({
      where: { id },
      data: {
        status: 'ORDERED',
        orderedAt: new Date(),
      },
    });

    await recordAudit(tx, ctx, {
      action: 'purchase.confirmed',
      entityType: 'purchase',
      entityId: id,
    });

    return getPurchaseWithTx(tx, id);
  });
}

export async function cancelPurchase(id: string, ctx: RequestContext): Promise<PurchaseDetail> {
  return withTransaction(async (tx) => {
    const [purchase] = await tx.$queryRaw<{ id: string; status: PurchaseStatus }[]>`
      SELECT id, status FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
    if (!purchase) throw notFound('Purchase');

    if (purchase.status !== 'DRAFT' && purchase.status !== 'ORDERED') {
      throw conflict(
        `Cannot cancel purchase in ${purchase.status} status`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    const receiptCount = await tx.purchaseReceipt.count({ where: { purchaseId: id } });
    if (receiptCount > 0) {
      throw conflict('Cannot cancel a purchase that has receipts', ErrorCode.INVALID_STATE_TRANSITION);
    }

    await tx.purchase.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await recordAudit(tx, ctx, {
      action: 'purchase.cancelled',
      entityType: 'purchase',
      entityId: id,
    });

    return getPurchaseWithTx(tx, id);
  });
}

export async function receiveGoods(
  id: string,
  input: ReceiveGoodsInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<ReceiveGoodsResult> {
  // 1. Idempotency replay check (BR-IDEM-01, BR-PUR-07)
  if (idempotencyKey) {
    const existing = await prisma.purchaseReceipt.findUnique({
      where: { idempotencyKey },
      include: {
        receivedBy: { select: publicUserSelect },
        items: {
          include: {
            purchaseItem: { select: { productId: true, productName: true, productSku: true } },
          },
        },
      },
    });

    if (existing) {
      if (existing.purchaseId !== id) {
        throw new AppError(
          422,
          ErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency key was already used with a different request payload',
        );
      }

      // Check item quantities match
      const existingItems = existing.items.map((i) => ({
        purchaseItemId: i.purchaseItemId,
        quantity: i.quantity,
      }));
      const sortedExisting = [...existingItems].sort((a, b) => a.purchaseItemId.localeCompare(b.purchaseItemId));
      const sortedInput = [...input.items].sort((a, b) => a.purchaseItemId.localeCompare(b.purchaseItemId));

      const isMatch =
        sortedExisting.length === sortedInput.length &&
        sortedExisting.every(
          (ex, idx) =>
            ex.purchaseItemId === sortedInput[idx]?.purchaseItemId && ex.quantity === sortedInput[idx]?.quantity,
        );

      if (!isMatch) {
        throw new AppError(
          422,
          ErrorCode.IDEMPOTENCY_KEY_REUSED,
          'Idempotency key was already used with a different request payload',
        );
      }

      return {
        replayed: true,
        receipt: {
          id: existing.id,
          receiptNumber: existing.receiptNumber,
          receivedAt: existing.receivedAt,
          notes: existing.notes,
          idempotencyKey: existing.idempotencyKey,
          receivedBy: existing.receivedBy,
          items: existing.items.map((it) => ({
            id: it.id,
            purchaseItemId: it.purchaseItemId,
            productId: it.purchaseItem.productId,
            productName: it.purchaseItem.productName,
            productSku: it.purchaseItem.productSku,
            quantity: it.quantity,
            unitCost: it.unitCost.toFixed(4),
          })),
        },
      };
    }
  }

  // 2. Perform receipt in transaction
  return withTransaction(async (tx) => {
    // Lock purchase header first
    const [purchase] = await tx.$queryRaw<{ id: string; status: PurchaseStatus }[]>`
      SELECT id, status FROM purchases WHERE id = ${id}::uuid FOR UPDATE`;
    if (!purchase) throw notFound('Purchase');

    if (purchase.status !== 'ORDERED' && purchase.status !== 'PARTIALLY_RECEIVED') {
      throw conflict(
        `Goods can only be received for ORDERED or PARTIALLY_RECEIVED purchases (current: ${purchase.status})`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    const purchaseItems = await tx.purchaseItem.findMany({
      where: { purchaseId: id },
    });
    const itemMap = new Map(purchaseItems.map((pi) => [pi.id, pi]));

    // Check receipt items validation
    const receiptItemIds = input.items.map((it) => it.purchaseItemId);
    if (new Set(receiptItemIds).size !== receiptItemIds.length) {
      throw businessRule('Duplicate purchase item in receipt lines', [
        { field: 'items', message: 'Each purchase item may only appear once in a receipt' },
      ]);
    }

    // Verify all items belong to this purchase and quantities are within bounds
    for (const it of input.items) {
      const pi = itemMap.get(it.purchaseItemId);
      if (!pi) {
        throw invalidReference('items', `Purchase item ${it.purchaseItemId} does not belong to this purchase`);
      }
      const remaining = pi.quantity - pi.receivedQuantity;
      if (it.quantity > remaining) {
        throw businessRule(
          `Received quantity ${it.quantity} exceeds remaining quantity ${remaining} on line ${pi.lineNo}`,
          [{ field: 'items', message: `Exceeds remaining quantity ${remaining}` }],
        );
      }
    }

    // Sort items by productId ascending to ensure consistent lock order across products
    const sortedInputs = [...input.items].sort((a, b) => {
      const prodA = itemMap.get(a.purchaseItemId)!.productId;
      const prodB = itemMap.get(b.purchaseItemId)!.productId;
      return prodA.localeCompare(prodB);
    });

    const receiptNumber = await nextDocumentNumber(tx, 'PURCHASE_RECEIPT');
    const receipt = await tx.purchaseReceipt.create({
      data: {
        receiptNumber,
        purchaseId: id,
        receivedById: ctx.actorId!,
        notes: input.notes,
        idempotencyKey: idempotencyKey ?? null,
      },
    });

    const createdItems: PurchaseReceiptItemDetail[] = [];

    for (const it of sortedInputs) {
      const pi = itemMap.get(it.purchaseItemId)!;

      // Net cost basis per unit (taxable / quantity), rounded to 4 decimals (BR-INV-05)
      const lineTaxable = new Prisma.Decimal(pi.unitCost)
        .mul(pi.quantity)
        .sub(pi.discountAmount)
        .sub(pi.allocatedDiscount);
      const netUnitCost = lineTaxable.div(pi.quantity).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

      // Increment received_quantity conditionally (BR-PUR-03)
      const updateCount = await tx.$executeRaw`
        UPDATE purchase_items
        SET received_quantity = received_quantity + ${it.quantity}
        WHERE id = ${pi.id}::uuid AND received_quantity + ${it.quantity} <= quantity
      `;
      if (updateCount === 0) {
        throw businessRule(`Failed to receive line ${pi.lineNo}: quantity exceeds remaining limit`);
      }

      const receiptItem = await tx.purchaseReceiptItem.create({
        data: {
          receiptId: receipt.id,
          purchaseItemId: pi.id,
          quantity: it.quantity,
          unitCost: netUnitCost,
        },
      });

      // Apply movement to inventory and update weighted-average cost (BR-INV-01, BR-INV-05)
      await applyMovement(tx, {
        productId: pi.productId,
        type: 'PURCHASE_RECEIPT',
        quantity: it.quantity,
        unitCost: netUnitCost,
        performedById: ctx.actorId!,
        purchaseReceiptId: receipt.id,
      });

      createdItems.push({
        id: receiptItem.id,
        purchaseItemId: pi.id,
        productId: pi.productId,
        productName: pi.productName,
        productSku: pi.productSku,
        quantity: it.quantity,
        unitCost: netUnitCost.toFixed(4),
      });
    }

    // Check if fully received
    const updatedItems = await tx.purchaseItem.findMany({
      where: { purchaseId: id },
      select: { quantity: true, receivedQuantity: true },
    });
    const fullyReceived = updatedItems.every((i) => i.receivedQuantity >= i.quantity);

    await tx.purchase.update({
      where: { id },
      data: {
        status: fullyReceived ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        receivedAt: fullyReceived ? new Date() : undefined,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'purchase.received',
      entityType: 'purchase_receipt',
      entityId: receipt.id,
      metadata: {
        purchaseId: id,
        receiptNumber,
        itemCount: createdItems.length,
        fullyReceived,
      },
    });

    const user = await tx.user.findUnique({
      where: { id: ctx.actorId! },
      select: publicUserSelect,
    });

    return {
      replayed: false,
      receipt: {
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        receivedAt: receipt.receivedAt,
        notes: receipt.notes,
        idempotencyKey: receipt.idempotencyKey,
        receivedBy: user,
        items: createdItems,
      },
    };
  });
}

export async function listPurchaseReceipts(purchaseId: string): Promise<PurchaseReceiptDetail[]> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw notFound('Purchase');

  const receipts = await prisma.purchaseReceipt.findMany({
    where: { purchaseId },
    include: {
      receivedBy: { select: publicUserSelect },
      items: {
        include: {
          purchaseItem: { select: { productId: true, productName: true, productSku: true } },
        },
      },
    },
    orderBy: { receivedAt: 'desc' },
  });

  return receipts.map((r) => ({
    id: r.id,
    receiptNumber: r.receiptNumber,
    receivedAt: r.receivedAt,
    notes: r.notes,
    idempotencyKey: r.idempotencyKey,
    receivedBy: r.receivedBy,
    items: r.items.map((it) => ({
      id: it.id,
      purchaseItemId: it.purchaseItemId,
      productId: it.purchaseItem.productId,
      productName: it.purchaseItem.productName,
      productSku: it.purchaseItem.productSku,
      quantity: it.quantity,
      unitCost: it.unitCost.toFixed(4),
    })),
  }));
}
