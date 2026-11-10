import { Prisma, type ReturnItemCondition, type SalesReturnStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withIdempotentTransaction, withTransaction, type Tx } from '../../common/db/transaction';
import { ErrorCode, businessRule, conflict, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { nextDocumentNumber } from '../../common/sequence/document-sequence';
import { applyMovement } from '../inventory/inventory.service';
import { computeOrderPaymentStatus, recordOrderRefund, type PaymentDetail } from '../payments/payments.service';
import { publicUserSelect } from '../users/users.presenter';
import type {
  CompleteSalesReturnInput,
  CreateSalesReturnInput,
  ListSalesReturnsQuery,
  RefundSalesReturnInput,
  RejectSalesReturnInput,
  SalesReturnSortField,
} from './sales-returns.schemas';

export interface SalesReturnItemDetail {
  id: string;
  orderItemId: string;
  productId: string;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  condition: ReturnItemCondition;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
}

export interface SalesReturnDetail {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  status: SalesReturnStatus;
  reason: string;
  notes: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  rejectionReason: string | null;
  idempotencyKey: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: string;
    returnedAmount: string;
    paidAmount: string;
    refundedAmount: string;
    customer: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
  };
  requestedBy: unknown;
  processedBy: unknown;
  items: SalesReturnItemDetail[];
  refunds: {
    id: string;
    paymentNumber: string;
    amount: string;
    paidAt: Date;
    paymentMethod: { id: string; code: string; name: string };
  }[];
  inventoryMovements: {
    id: string;
    productId: string;
    type: string;
    quantityChange: number;
    createdAt: Date;
  }[];
}

export interface SalesReturnListItem {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  status: SalesReturnStatus;
  reason: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  itemCount: number;
  processedAt: Date | null;
  createdAt: Date;
}

function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

function formatMoney(value: Prisma.Decimal | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

function mapSalesReturnItem(item: {
  id: string;
  orderItemId: string;
  quantity: number;
  condition: ReturnItemCondition;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  orderItem: {
    productId: string;
    productName: string;
    productSku: string;
    unit: string;
  };
}): SalesReturnItemDetail {
  return {
    id: item.id,
    orderItemId: item.orderItemId,
    productId: item.orderItem.productId,
    productName: item.orderItem.productName,
    productSku: item.orderItem.productSku,
    unit: item.orderItem.unit,
    quantity: item.quantity,
    condition: item.condition,
    subtotal: formatMoney(item.subtotal),
    taxAmount: formatMoney(item.taxAmount),
    totalAmount: formatMoney(item.totalAmount),
  };
}

function mapSalesReturnDetail(ret: {
  id: string;
  returnNumber: string;
  orderId: string;
  status: SalesReturnStatus;
  reason: string;
  notes: string | null;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  rejectionReason: string | null;
  idempotencyKey: string | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    totalAmount: Prisma.Decimal;
    returnedAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    refundedAmount: Prisma.Decimal;
    customer: {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
    } | null;
  };
  requestedBy: unknown;
  processedBy: unknown;
  items: {
    id: string;
    orderItemId: string;
    quantity: number;
    condition: ReturnItemCondition;
    subtotal: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    orderItem: {
      productId: string;
      productName: string;
      productSku: string;
      unit: string;
    };
  }[];
  refunds: {
    id: string;
    paymentNumber: string;
    amount: Prisma.Decimal;
    paidAt: Date;
    paymentMethod: { id: string; code: string; name: string };
  }[];
  inventoryMovements: {
    id: string;
    productId: string;
    type: string;
    quantityChange: number;
    createdAt: Date;
  }[];
}): SalesReturnDetail {
  return {
    id: ret.id,
    returnNumber: ret.returnNumber,
    orderId: ret.orderId,
    orderNumber: ret.order.orderNumber,
    status: ret.status,
    reason: ret.reason,
    notes: ret.notes,
    subtotal: formatMoney(ret.subtotal),
    taxAmount: formatMoney(ret.taxAmount),
    totalAmount: formatMoney(ret.totalAmount),
    rejectionReason: ret.rejectionReason,
    idempotencyKey: ret.idempotencyKey,
    processedAt: ret.processedAt,
    createdAt: ret.createdAt,
    updatedAt: ret.updatedAt,
    order: {
      id: ret.order.id,
      orderNumber: ret.order.orderNumber,
      status: ret.order.status,
      paymentStatus: ret.order.paymentStatus,
      totalAmount: formatMoney(ret.order.totalAmount),
      returnedAmount: formatMoney(ret.order.returnedAmount),
      paidAmount: formatMoney(ret.order.paidAmount),
      refundedAmount: formatMoney(ret.order.refundedAmount),
      customer: ret.order.customer,
    },
    requestedBy: ret.requestedBy,
    processedBy: ret.processedBy,
    items: ret.items.map(mapSalesReturnItem),
    refunds: ret.refunds.map((r) => ({
      id: r.id,
      paymentNumber: r.paymentNumber,
      amount: formatMoney(r.amount),
      paidAt: r.paidAt,
      paymentMethod: r.paymentMethod,
    })),
    inventoryMovements: ret.inventoryMovements.map((m) => ({
      id: m.id,
      productId: m.productId,
      type: m.type,
      quantityChange: m.quantityChange,
      createdAt: m.createdAt,
    })),
  };
}

/**
 * Calculates line credit according to BR-RET-04.
 */
export function calculateLineCredit(
  orderItem: {
    quantity: number;
    unitPrice: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    allocatedDiscount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  },
  returnedQty: number,
  prevCompletedQty: number,
  prevCompletedSubtotal: Prisma.Decimal,
  prevCompletedTax: Prisma.Decimal,
): { subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; totalAmount: Prisma.Decimal } {
  const soldQty = orderItem.quantity;
  const taxable = round2(
    new Prisma.Decimal(orderItem.unitPrice)
      .mul(soldQty)
      .sub(orderItem.discountAmount)
      .sub(orderItem.allocatedDiscount),
  );
  const orderItemTax = new Prisma.Decimal(orderItem.taxAmount);

  let subtotal: Prisma.Decimal;
  let taxAmount: Prisma.Decimal;

  if (prevCompletedQty + returnedQty === soldQty) {
    // Fully returned: absorbs rounding
    subtotal = taxable.sub(prevCompletedSubtotal);
    taxAmount = orderItemTax.sub(prevCompletedTax);
  } else {
    // Partial return
    subtotal = round2(taxable.mul(returnedQty).div(soldQty));
    taxAmount = round2(orderItemTax.mul(returnedQty).div(soldQty));
  }

  const totalAmount = subtotal.add(taxAmount);
  return { subtotal, taxAmount, totalAmount };
}

async function findReplayedSalesReturn(
  db: Tx | typeof prisma,
  input: CreateSalesReturnInput,
  idempotencyKey: string,
): Promise<{ replayed: boolean; salesReturn: SalesReturnDetail } | null> {
  const existing = await db.salesReturn.findUnique({
    where: { idempotencyKey },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          returnedAmount: true,
          paidAmount: true,
          refundedAmount: true,
          customer: { select: { id: true, name: true, phone: true, email: true } },
        },
      },
      requestedBy: { select: publicUserSelect },
      processedBy: { select: publicUserSelect },
      items: {
        include: {
          orderItem: { select: { productId: true, productName: true, productSku: true, unit: true } },
        },
      },
      refunds: {
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paidAt: true,
          paymentMethod: { select: { id: true, code: true, name: true } },
        },
      },
      inventoryMovements: {
        select: { id: true, productId: true, type: true, quantityChange: true, createdAt: true },
      },
    },
  });
  if (!existing) return null;

  const sameOrder = existing.orderId === input.orderId;
  const sameReason = existing.reason === input.reason;
  const sameNotes = (existing.notes ?? null) === (input.notes ?? null);
  const sameItems =
    existing.items.length === input.items.length &&
    input.items.every((it) =>
      existing.items.some(
        (ex) =>
          ex.orderItemId === it.orderItemId &&
          ex.quantity === it.quantity &&
          ex.condition === it.condition,
      ),
    );

  if (!sameOrder || !sameReason || !sameNotes || !sameItems) {
    throw conflict(
      'Idempotency key has already been used with a different request payload',
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
    );
  }

  return { replayed: true, salesReturn: mapSalesReturnDetail(existing) };
}

export async function createSalesReturn(
  input: CreateSalesReturnInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; salesReturn: SalesReturnDetail }> {
  return withIdempotentTransaction(
    async (tx) => {
      // 1. Idempotency replay check
      if (idempotencyKey) {
        const replayed = await findReplayedSalesReturn(tx, input, idempotencyKey);
        if (replayed) return replayed;
      }

    // 2. Validate order exists and lock order header (BR-CONC-01)
    const [order] = await tx.$queryRaw<
      {
        id: string;
        order_number: string;
        status: string;
        total_amount: Prisma.Decimal;
        returned_amount: Prisma.Decimal;
        paid_amount: Prisma.Decimal;
        refunded_amount: Prisma.Decimal;
      }[]
    >`
      SELECT id, order_number, status, total_amount, returned_amount, paid_amount, refunded_amount
      FROM orders
      WHERE id = ${input.orderId}::uuid
      FOR UPDATE`;

    if (!order) throw notFound('Order');

    // BR-RET-01: Returns are allowed only for delivered or completed orders
    const allowedStatuses = ['DELIVERED', 'COMPLETED'];
    if (!allowedStatuses.includes(order.status)) {
      throw conflict(
        `Returns are not allowed on orders with status ${order.status}`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    // 3. Validate line items
    const lineItemIds = input.items.map((i) => i.orderItemId);
    if (new Set(lineItemIds).size !== lineItemIds.length) {
      throw businessRule('Duplicate order items in return lines are not permitted', [
        { field: 'items', message: 'Each order item can appear only once in a return' },
      ]);
    }

    const orderItems = await tx.orderItem.findMany({
      where: { orderId: input.orderId },
    });
    const orderItemMap = new Map(orderItems.map((oi) => [oi.id, oi]));

    for (const item of input.items) {
      if (!orderItemMap.has(item.orderItemId)) {
        throw invalidReference('items.orderItemId', `Order item ${item.orderItemId} does not belong to this order`);
      }
    }

    // 4. Validate quantity limits against PENDING and COMPLETED returns (BR-RET-02)
    const existingReturnItems = await tx.salesReturnItem.findMany({
      where: {
        orderItemId: { in: lineItemIds },
        salesReturn: { status: { in: ['PENDING', 'COMPLETED'] } },
      },
      select: {
        orderItemId: true,
        quantity: true,
        subtotal: true,
        taxAmount: true,
        salesReturn: { select: { status: true } },
      },
    });

    // Group existing quantities and completed amounts by orderItemId
    const existingQtyMap = new Map<string, number>();
    const completedQtyMap = new Map<string, number>();
    const completedSubtotalMap = new Map<string, Prisma.Decimal>();
    const completedTaxMap = new Map<string, Prisma.Decimal>();

    for (const ex of existingReturnItems) {
      const q = existingQtyMap.get(ex.orderItemId) ?? 0;
      existingQtyMap.set(ex.orderItemId, q + ex.quantity);

      if (ex.salesReturn.status === 'COMPLETED') {
        const cq = completedQtyMap.get(ex.orderItemId) ?? 0;
        completedQtyMap.set(ex.orderItemId, cq + ex.quantity);

        const cs = completedSubtotalMap.get(ex.orderItemId) ?? new Prisma.Decimal(0);
        completedSubtotalMap.set(ex.orderItemId, cs.add(ex.subtotal));

        const ct = completedTaxMap.get(ex.orderItemId) ?? new Prisma.Decimal(0);
        completedTaxMap.set(ex.orderItemId, ct.add(ex.taxAmount));
      }
    }

    let headerSubtotal = new Prisma.Decimal(0);
    let headerTax = new Prisma.Decimal(0);
    let headerTotal = new Prisma.Decimal(0);

    const calculatedLines = input.items.map((item) => {
      const oi = orderItemMap.get(item.orderItemId)!;
      const alreadyReturned = existingQtyMap.get(item.orderItemId) ?? 0;
      const availableQty = oi.quantity - alreadyReturned;

      if (item.quantity > availableQty) {
        throw businessRule(
          `Requested return quantity (${item.quantity}) for product "${oi.productName}" exceeds available quantity (${availableQty})`,
          [
            {
              field: 'items',
              message: `Maximum returnable quantity for line ${oi.lineNo} is ${availableQty}`,
            },
          ],
        );
      }

      // Preview credit calculation against COMPLETED returns (BR-RET-04)
      const prevCq = completedQtyMap.get(item.orderItemId) ?? 0;
      const prevCs = completedSubtotalMap.get(item.orderItemId) ?? new Prisma.Decimal(0);
      const prevCt = completedTaxMap.get(item.orderItemId) ?? new Prisma.Decimal(0);

      const credit = calculateLineCredit(oi, item.quantity, prevCq, prevCs, prevCt);

      headerSubtotal = headerSubtotal.add(credit.subtotal);
      headerTax = headerTax.add(credit.taxAmount);
      headerTotal = headerTotal.add(credit.totalAmount);

      return {
        orderItemId: item.orderItemId,
        quantity: item.quantity,
        condition: item.condition,
        subtotal: credit.subtotal,
        taxAmount: credit.taxAmount,
        totalAmount: credit.totalAmount,
      };
    });

    // 5. Allocate return number
    const returnNumber = await nextDocumentNumber(tx, 'SALES_RETURN');

    // 6. Create SalesReturn and items
    const created = await tx.salesReturn.create({
      data: {
        returnNumber,
        orderId: input.orderId,
        status: 'PENDING',
        reason: input.reason,
        notes: input.notes ?? null,
        subtotal: headerSubtotal,
        taxAmount: headerTax,
        totalAmount: headerTotal,
        requestedById: ctx.actorId!,
        idempotencyKey: idempotencyKey ?? null,
        items: {
          create: calculatedLines.map((line) => ({
            orderItemId: line.orderItemId,
            quantity: line.quantity,
            condition: line.condition,
            subtotal: line.subtotal,
            taxAmount: line.taxAmount,
            totalAmount: line.totalAmount,
          })),
        },
      },
    });

    await recordAudit(tx, ctx, {
      action: 'returns.created',
      entityType: 'sales_return',
      entityId: created.id,
      metadata: {
        returnNumber,
        orderId: input.orderId,
        orderNumber: order.order_number,
        totalAmount: headerTotal.toString(),
        itemCount: input.items.length,
      },
    });

    const detail = await fetchSalesReturnDetail(tx, created.id);
    return { replayed: false, salesReturn: detail };
  },
  {
    idempotencyKey,
    onReplay: () =>
      idempotencyKey ? findReplayedSalesReturn(prisma, input, idempotencyKey) : Promise.resolve(null),
  });
}

export async function listSalesReturns(
  query: ListSalesReturnsQuery,
): Promise<Paginated<SalesReturnListItem>> {
  const filters: Prisma.SalesReturnWhereInput[] = [];

  if (query.orderId) filters.push({ orderId: query.orderId });
  if (query.customerId) filters.push({ order: { customerId: query.customerId } });
  if (query.status && query.status.length > 0) filters.push({ status: { in: query.status } });

  if (query.from || query.to) {
    filters.push({
      createdAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const listArgs = buildListArgs<
    SalesReturnSortField,
    Prisma.SalesReturnWhereInput,
    Prisma.SalesReturnOrderByWithRelationInput
  >(
    query,
    {
      searchFields: ['returnNumber', 'reason', 'order.orderNumber', 'order.customerName'],
      sortFields: {
        returnNumber: 'returnNumber',
        createdAt: 'createdAt',
        processedAt: 'processedAt',
        totalAmount: 'totalAmount',
        status: 'status',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    filters,
  );

  return paginate(
    query,
    async () => {
      const rows = await prisma.salesReturn.findMany({
        ...listArgs,
        select: {
          id: true,
          returnNumber: true,
          orderId: true,
          status: true,
          reason: true,
          subtotal: true,
          taxAmount: true,
          totalAmount: true,
          processedAt: true,
          createdAt: true,
          order: { select: { orderNumber: true, customerName: true } },
          _count: { select: { items: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        returnNumber: row.returnNumber,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        customerName: row.order.customerName,
        status: row.status,
        reason: row.reason,
        subtotal: formatMoney(row.subtotal),
        taxAmount: formatMoney(row.taxAmount),
        totalAmount: formatMoney(row.totalAmount),
        itemCount: row._count.items,
        processedAt: row.processedAt,
        createdAt: row.createdAt,
      }));
    },
    () => prisma.salesReturn.count({ where: listArgs.where }),
  );
}

export async function getSalesReturn(id: string): Promise<SalesReturnDetail> {
  const detail = await fetchSalesReturnDetail(prisma, id);
  if (!detail) throw notFound('Sales return');
  return detail;
}

export async function completeSalesReturn(
  id: string,
  input: CompleteSalesReturnInput,
  ctx: RequestContext,
): Promise<SalesReturnDetail> {
  return withTransaction(async (tx) => {
    // 1. Lock parent order first, then sales_return row (BR-CONC-01: orders -> sales_returns -> products)
    const [order] = await tx.$queryRaw<
      {
        id: string;
        order_number: string;
        status: string;
        total_amount: Prisma.Decimal;
        returned_amount: Prisma.Decimal;
        paid_amount: Prisma.Decimal;
        refunded_amount: Prisma.Decimal;
      }[]
    >`
      SELECT id, order_number, status, total_amount, returned_amount, paid_amount, refunded_amount
      FROM orders
      WHERE id = (SELECT order_id FROM sales_returns WHERE id = ${id}::uuid)
      FOR UPDATE`;

    if (!order) throw notFound('Sales return');

    await tx.$queryRaw`
      SELECT id FROM sales_returns WHERE id = ${id}::uuid FOR UPDATE`;

    // 2. Fetch sales return under lock so status cannot change concurrently
    const salesReturn = await tx.salesReturn.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!salesReturn) throw notFound('Sales return');

    if (salesReturn.status !== 'PENDING') {
      throw conflict(
        `Cannot complete sales return with status ${salesReturn.status}`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    // 3. Fetch order items
    const orderItems = await tx.orderItem.findMany({
      where: { orderId: salesReturn.orderId },
    });
    const orderItemMap = new Map(orderItems.map((oi) => [oi.id, oi]));

    // 4. Products lock order: lock products for resalable items in ascending ASCII order (BR-CONC-01)
    const resalableItems = salesReturn.items.filter((i) => i.condition === 'RESALABLE');
    const resalableProductIds = [
      ...new Set(resalableItems.map((i) => orderItemMap.get(i.orderItemId)!.productId)),
    ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    if (resalableProductIds.length > 0) {
      await tx.$queryRaw`
        SELECT id FROM products
        WHERE id = ANY(${resalableProductIds}::uuid[])
        ORDER BY id ASC
        FOR UPDATE`;
    }

    // 5. Quantity and credit validation against OTHER COMPLETED returns
    const lineItemIds = salesReturn.items.map((i) => i.orderItemId);
    const otherCompletedItems = await tx.salesReturnItem.findMany({
      where: {
        orderItemId: { in: lineItemIds },
        salesReturnId: { not: salesReturn.id },
        salesReturn: { status: 'COMPLETED' },
      },
      select: {
        orderItemId: true,
        quantity: true,
        subtotal: true,
        taxAmount: true,
      },
    });

    const otherCompletedQtyMap = new Map<string, number>();
    const otherCompletedSubtotalMap = new Map<string, Prisma.Decimal>();
    const otherCompletedTaxMap = new Map<string, Prisma.Decimal>();

    for (const ex of otherCompletedItems) {
      const q = otherCompletedQtyMap.get(ex.orderItemId) ?? 0;
      otherCompletedQtyMap.set(ex.orderItemId, q + ex.quantity);

      const s = otherCompletedSubtotalMap.get(ex.orderItemId) ?? new Prisma.Decimal(0);
      otherCompletedSubtotalMap.set(ex.orderItemId, s.add(ex.subtotal));

      const t = otherCompletedTaxMap.get(ex.orderItemId) ?? new Prisma.Decimal(0);
      otherCompletedTaxMap.set(ex.orderItemId, t.add(ex.taxAmount));
    }

    let finalSubtotal = new Prisma.Decimal(0);
    let finalTax = new Prisma.Decimal(0);
    let finalTotal = new Prisma.Decimal(0);

    for (const item of salesReturn.items) {
      const oi = orderItemMap.get(item.orderItemId)!;
      const prevQty = otherCompletedQtyMap.get(item.orderItemId) ?? 0;

      if (prevQty + item.quantity > oi.quantity) {
        throw businessRule(
          `Return quantity (${item.quantity}) for product "${oi.productName}" exceeds original sold quantity when combined with other completed returns`,
          [{ field: 'items', message: `Remaining returnable quantity is ${oi.quantity - prevQty}` }],
        );
      }

      const prevSubtotal = otherCompletedSubtotalMap.get(item.orderItemId) ?? new Prisma.Decimal(0);
      const prevTax = otherCompletedTaxMap.get(item.orderItemId) ?? new Prisma.Decimal(0);

      const credit = calculateLineCredit(oi, item.quantity, prevQty, prevSubtotal, prevTax);

      // Update return item row with final rounded amounts
      await tx.salesReturnItem.update({
        where: { id: item.id },
        data: {
          subtotal: credit.subtotal,
          taxAmount: credit.taxAmount,
          totalAmount: credit.totalAmount,
        },
      });

      finalSubtotal = finalSubtotal.add(credit.subtotal);
      finalTax = finalTax.add(credit.taxAmount);
      finalTotal = finalTotal.add(credit.totalAmount);

      // 6. Restock RESALABLE items via SALE_RETURN movement (BR-RET-03)
      if (item.condition === 'RESALABLE') {
        const product = await tx.product.findUniqueOrThrow({ where: { id: oi.productId } });
        const unitCost = oi.unitCost
          ? new Prisma.Decimal(oi.unitCost)
          : new Prisma.Decimal(product.costPrice ?? 0);

        await applyMovement(tx, {
          productId: oi.productId,
          type: 'SALE_RETURN',
          quantity: item.quantity,
          unitCost,
          salesReturnId: salesReturn.id,
          performedById: ctx.actorId!,
        });
      }
    }

    // 7. Update SalesReturn status to COMPLETED
    const now = new Date();
    await tx.salesReturn.update({
      where: { id: salesReturn.id },
      data: {
        status: 'COMPLETED',
        subtotal: finalSubtotal,
        taxAmount: finalTax,
        totalAmount: finalTotal,
        processedById: ctx.actorId!,
        processedAt: now,
        notes: input.notes !== undefined ? input.notes : salesReturn.notes,
      },
    });

    // 8. Update Order returnedAmount and paymentStatus (BR-RET-05)
    const newReturnedAmount = new Prisma.Decimal(order.returned_amount).add(finalTotal);
    const effectiveTotal = new Prisma.Decimal(order.total_amount).sub(newReturnedAmount);
    const newPaymentStatus = computeOrderPaymentStatus(
      effectiveTotal,
      new Prisma.Decimal(order.paid_amount),
      new Prisma.Decimal(order.refunded_amount),
    );

    await tx.order.update({
      where: { id: salesReturn.orderId },
      data: {
        returnedAmount: newReturnedAmount,
        paymentStatus: newPaymentStatus,
      },
    });

    // 9. Record audit log
    await recordAudit(tx, ctx, {
      action: 'returns.completed',
      entityType: 'sales_return',
      entityId: salesReturn.id,
      metadata: {
        returnNumber: salesReturn.returnNumber,
        orderId: salesReturn.orderId,
        orderNumber: order.order_number,
        totalAmount: finalTotal.toString(),
        returnedAmount: newReturnedAmount.toString(),
        paymentStatus: newPaymentStatus,
      },
    });

    return fetchSalesReturnDetail(tx, salesReturn.id);
  });
}

export async function rejectSalesReturn(
  id: string,
  input: RejectSalesReturnInput,
  ctx: RequestContext,
): Promise<SalesReturnDetail> {
  return withTransaction(async (tx) => {
    // Lock parent order first, then sales_return row (BR-CONC-01)
    await tx.$queryRaw`
      SELECT id FROM orders
      WHERE id = (SELECT order_id FROM sales_returns WHERE id = ${id}::uuid)
      FOR UPDATE`;
    await tx.$queryRaw`
      SELECT id FROM sales_returns WHERE id = ${id}::uuid FOR UPDATE`;

    const salesReturn = await tx.salesReturn.findUnique({
      where: { id },
      include: { order: { select: { orderNumber: true } } },
    });
    if (!salesReturn) throw notFound('Sales return');

    if (salesReturn.status !== 'PENDING') {
      throw conflict(
        `Cannot reject sales return with status ${salesReturn.status}`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    const now = new Date();
    await tx.salesReturn.update({
      where: { id },
      data: {
        status: 'REJECTED',
        rejectionReason: input.reason,
        processedById: ctx.actorId!,
        processedAt: now,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'returns.rejected',
      entityType: 'sales_return',
      entityId: salesReturn.id,
      metadata: {
        returnNumber: salesReturn.returnNumber,
        orderId: salesReturn.orderId,
        orderNumber: salesReturn.order.orderNumber,
        rejectionReason: input.reason,
      },
    });

    return fetchSalesReturnDetail(tx, salesReturn.id);
  });
}

export async function refundSalesReturn(
  id: string,
  input: RefundSalesReturnInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  // Check idempotency key early so replays with omitted amount reach recordOrderRefund
  if (idempotencyKey) {
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
      select: { amount: true, orderId: true },
    });
    if (existingPayment) {
      const salesReturnForOrder = await prisma.salesReturn.findUnique({
        where: { id },
        select: { orderId: true },
      });
      if (!salesReturnForOrder) throw notFound('Sales return');

      return recordOrderRefund(
        salesReturnForOrder.orderId,
        {
          paymentMethodId: input.paymentMethodId,
          amount: input.amount ?? existingPayment.amount.toString(),
          salesReturnId: id,
          paidAt: input.paidAt,
          reference: input.reference,
          notes: input.notes,
        },
        ctx,
        idempotencyKey,
      );
    }
  }

  // 1. Fetch return
  const salesReturn = await prisma.salesReturn.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          totalAmount: true,
          returnedAmount: true,
          paidAmount: true,
          refundedAmount: true,
        },
      },
    },
  });
  if (!salesReturn) throw notFound('Sales return');

  if (salesReturn.status !== 'COMPLETED') {
    throw conflict(
      'Refunds can only be issued for completed sales returns',
      ErrorCode.INVALID_STATE_TRANSITION,
    );
  }

  // Determine amount if not provided:
  // Default to remaining return amount or max refundable credit
  let refundAmountStr = input.amount;
  if (!refundAmountStr) {
    const existingRefunds = await prisma.payment.findMany({
      where: { salesReturnId: id, type: 'REFUND' },
      select: { amount: true, reversal: { select: { id: true } } },
    });
    const activeRefunds = existingRefunds.filter((r) => !r.reversal);
    const refundedForReturn = activeRefunds.reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));
    const unrefundedReturnAmount = new Prisma.Decimal(salesReturn.totalAmount).sub(refundedForReturn);

    const netPaid = new Prisma.Decimal(salesReturn.order.paidAmount).sub(salesReturn.order.refundedAmount);
    const effectiveTotal = new Prisma.Decimal(salesReturn.order.totalAmount).sub(salesReturn.order.returnedAmount);
    const balanceDue = effectiveTotal.sub(netPaid);
    const refundableCredit = balanceDue.isNegative() ? balanceDue.negated() : new Prisma.Decimal(0);

    const candidate = Prisma.Decimal.min(unrefundedReturnAmount, refundableCredit);
    if (candidate.lessThanOrEqualTo(0)) {
      throw businessRule(
        'No refund is owed on an active order with non-negative balance due',
        [{ field: 'amount', message: 'Order has no refundable credit' }],
      );
    }
    refundAmountStr = candidate.toFixed(2);
  }

  return recordOrderRefund(
    salesReturn.orderId,
    {
      paymentMethodId: input.paymentMethodId,
      amount: refundAmountStr,
      salesReturnId: id,
      paidAt: input.paidAt,
      reference: input.reference,
      notes: input.notes,
    },
    ctx,
    idempotencyKey,
  );
}

async function fetchSalesReturnDetail(tx: Tx | typeof prisma, id: string): Promise<SalesReturnDetail> {
  const row = await tx.salesReturn.findUnique({
    where: { id },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          returnedAmount: true,
          paidAmount: true,
          refundedAmount: true,
          customer: { select: { id: true, name: true, phone: true, email: true } },
        },
      },
      requestedBy: { select: publicUserSelect },
      processedBy: { select: publicUserSelect },
      items: {
        include: {
          orderItem: { select: { productId: true, productName: true, productSku: true, unit: true } },
        },
      },
      refunds: {
        select: {
          id: true,
          paymentNumber: true,
          amount: true,
          paidAt: true,
          paymentMethod: { select: { id: true, code: true, name: true } },
        },
      },
      inventoryMovements: {
        select: { id: true, productId: true, type: true, quantityChange: true, createdAt: true },
      },
    },
  });

  if (!row) throw notFound('Sales return');
  return mapSalesReturnDetail(row);
}
