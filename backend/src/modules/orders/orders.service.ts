import { Prisma, type OrderStatus, type PaymentStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { ErrorCode, businessRule, conflict, forbidden, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { calculateDocumentTotals } from '../../common/pricing/document-calculator';
import { nextDocumentNumber } from '../../common/sequence/document-sequence';
import { publicUserSelect } from '../users/users.presenter';
import { applyMovement } from '../inventory/inventory.service';
import type {
  CancelOrderInput,
  CreateOrderInput,
  ListOrdersQuery,
  OrderSortField,
  ShipOrderInput,
  UpdateOrderInput,
} from './orders.schemas';

export interface OrderActor extends RequestContext {
  canApplyDiscount?: boolean;
  canCancelConfirmed?: boolean;
}

export interface OrderItemDetail {
  id: string;
  productId: string;
  lineNo: number;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  unitCost: string | null;
  discountAmount: string;
  allocatedDiscount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
}

export interface OrderPaymentSummary {
  id: string;
  paymentNumber: string;
  type: string;
  amount: string;
  paidAt: Date;
  reference: string | null;
  paymentMethod: { id: string; name: string; code: string };
  recordedBy: unknown;
}

export interface OrderDetail {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountType: string | null;
  discountValue: string | null;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  refundedAmount: string;
  returnedAmount: string;
  balanceDue: string;
  notes: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  confirmedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    status: string;
  } | null;
  createdBy: unknown;
  confirmedBy: unknown;
  completedBy: unknown;
  cancelledBy: unknown;
  items: OrderItemDetail[];
  payments: OrderPaymentSummary[];
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  itemCount: number;
  confirmedAt: Date | null;
  createdAt: Date;
}

export interface OrderInvoiceDetail {
  invoiceNumber: string;
  status: 'ISSUED' | 'CANCELLED';
  issueDate: Date | null;
  dueDate: Date | null;
  orderNumber: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  business: {
    businessName: string;
    currency: string;
    taxEnabled: boolean;
    taxLabel: string;
    taxId: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    invoiceFooter: string | null;
  };
  customer: {
    id: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
  };
  items: OrderItemDetail[];
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
}

const orderItemSelect = {
  id: true,
  productId: true,
  lineNo: true,
  productName: true,
  productSku: true,
  unit: true,
  quantity: true,
  unitPrice: true,
  unitCost: true,
  discountAmount: true,
  allocatedDiscount: true,
  taxRate: true,
  taxAmount: true,
  lineTotal: true,
} as const;

function formatMoney(value: Prisma.Decimal | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

function calculateBalanceDue(order: {
  status: OrderStatus;
  totalAmount: Prisma.Decimal;
  returnedAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
  refundedAmount: Prisma.Decimal;
}): string {
  if (order.status === 'CANCELLED') return '0.00';
  const effectiveTotal = new Prisma.Decimal(order.totalAmount).sub(order.returnedAmount);
  const netPaid = new Prisma.Decimal(order.paidAmount).sub(order.refundedAmount);
  const due = effectiveTotal.sub(netPaid);
  return due.isNegative() ? '0.00' : due.toFixed(2);
}

function mapOrderItem(item: {
  id: string;
  productId: string;
  lineNo: number;
  productName: string;
  productSku: string;
  unit: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
  discountAmount: Prisma.Decimal;
  allocatedDiscount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}): OrderItemDetail {
  return {
    id: item.id,
    productId: item.productId,
    lineNo: item.lineNo,
    productName: item.productName,
    productSku: item.productSku,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: formatMoney(item.unitPrice),
    unitCost: item.unitCost ? new Prisma.Decimal(item.unitCost).toFixed(4) : null,
    discountAmount: formatMoney(item.discountAmount),
    allocatedDiscount: formatMoney(item.allocatedDiscount),
    taxRate: item.taxRate.toString(),
    taxAmount: formatMoney(item.taxAmount),
    lineTotal: formatMoney(item.lineTotal),
  };
}

async function validateAndCalculateLines(
  tx: Tx,
  items: {
    productId: string;
    quantity: number;
    unitPrice?: string | null;
    discountAmount?: string | null;
    taxRate?: string | null;
  }[],
  discountType?: 'FIXED' | 'PERCENTAGE' | null,
  discountValue?: string | null,
  actor?: OrderActor,
) {
  if (!items || items.length === 0) {
    throw businessRule('An order requires at least one item', [
      { field: 'items', message: 'At least one line item is required' },
    ]);
  }

  // Deduplicate product check
  const productIds = items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    throw businessRule('Duplicate products in order lines are not permitted', [
      { field: 'items', message: 'Each product can appear only once in an order' },
    ]);
  }

  // Check discount permission
  const hasLineDiscounts = items.some((i) => i.discountAmount && Number(i.discountAmount) > 0);
  const hasHeaderDiscount = Boolean(discountType && discountValue && Number(discountValue) > 0);
  if (hasLineDiscounts || hasHeaderDiscount) {
    if (actor && actor.canApplyDiscount === false) {
      throw forbidden('You do not have permission to apply discounts');
    }
  }

  // Fetch settings for default tax rate
  const settings = await tx.businessSetting.findUnique({ where: { id: 1 } });
  const defaultTaxRate = settings?.taxEnabled ? (settings.defaultTaxRate ?? new Prisma.Decimal(0)) : new Prisma.Decimal(0);

  // Fetch products
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
  });
  if (products.length !== productIds.length) {
    const found = new Set(products.map((p) => p.id));
    const missing = productIds.find((id) => !found.has(id));
    throw invalidReference('items.productId', `Product ${missing} not found`);
  }

  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const product of products) {
    if (product.status !== 'ACTIVE') {
      throw businessRule(`Product "${product.name}" is not active`, [
        { field: 'items', message: `Product ${product.sku} is not active` },
      ]);
    }
  }

  const linesInput = items.map((item) => {
    const product = productMap.get(item.productId)!;
    const unitPrice = item.unitPrice !== undefined && item.unitPrice !== null ? item.unitPrice : product.sellingPrice;
    const taxRate =
      item.taxRate !== undefined && item.taxRate !== null
        ? item.taxRate
        : product.taxRate !== null
          ? product.taxRate
          : defaultTaxRate;

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCostOrPrice: unitPrice,
      lineDiscount: item.discountAmount,
      taxRate,
    };
  });

  const headerDiscount =
    discountType && discountValue
      ? { type: discountType, value: discountValue }
      : null;

  const calculationResult = calculateDocumentTotals(linesInput, headerDiscount);
  return { calculationResult, productMap };
}

export async function createOrder(input: CreateOrderInput, actor: OrderActor): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    let customerName = input.customerName ?? null;
    let customerPhone = input.customerPhone ?? null;
    let customerAddress = input.customerAddress ?? null;

    if (input.customerId) {
      const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw invalidReference('customerId', 'Customer not found');
      if (customer.status !== 'ACTIVE') {
        throw businessRule('Customer is not active', [
          { field: 'customerId', message: 'Only active customers can place orders' },
        ]);
      }
      customerName = customerName ?? customer.name;
      customerPhone = customerPhone ?? customer.phone;
      customerAddress = customerAddress ?? customer.address;
    }

    const { calculationResult, productMap } = await validateAndCalculateLines(
      tx,
      input.items,
      input.discountType,
      input.discountValue,
      actor,
    );

    const orderNumber = await nextDocumentNumber(tx, 'ORDER');

    const order = await tx.order.create({
      data: {
        orderNumber,
        customerId: input.customerId ?? null,
        customerName,
        customerPhone,
        customerAddress,
        notes: input.notes ?? null,
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        subtotal: calculationResult.subtotal,
        discountType: calculationResult.discountType,
        discountValue: calculationResult.discountValue,
        discountAmount: calculationResult.discountAmount,
        taxAmount: calculationResult.taxAmount,
        totalAmount: calculationResult.totalAmount,
        createdById: actor.actorId!,
      },
    });

    for (let i = 0; i < calculationResult.lines.length; i++) {
      const line = calculationResult.lines[i]!;
      const product = productMap.get(line.productId)!;
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          lineNo: i + 1,
          productName: product.name,
          productSku: product.sku,
          unit: product.unit,
          quantity: line.quantity,
          unitPrice: line.unitCostOrPrice,
          unitCost: product.costPrice,
          discountAmount: line.lineDiscount,
          allocatedDiscount: line.allocatedDiscount,
          taxRate: line.taxRate,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
        },
      });
    }

    await recordAudit(tx, actor, {
      action: 'order.created',
      entityType: 'order',
      entityId: order.id,
      metadata: {
        orderNumber,
        customerId: input.customerId,
        totalAmount: calculationResult.totalAmount.toString(),
      },
    });

    return getOrderWithTx(tx, order.id);
  });
}

export async function getOrder(id: string): Promise<OrderDetail> {
  return prisma.$transaction((tx) => getOrderWithTx(tx, id));
}

async function getOrderWithTx(tx: Tx, id: string): Promise<OrderDetail> {
  const order = await tx.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true, address: true, status: true } },
      createdBy: { select: publicUserSelect },
      confirmedBy: { select: publicUserSelect },
      completedBy: { select: publicUserSelect },
      cancelledBy: { select: publicUserSelect },
      items: {
        select: orderItemSelect,
        orderBy: { lineNo: 'asc' },
      },
      payments: {
        include: {
          paymentMethod: { select: { id: true, name: true, code: true } },
          recordedBy: { select: publicUserSelect },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) throw notFound('Order');

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    invoiceNumber: order.invoiceNumber,
    customerId: order.customerId,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    status: order.status,
    paymentStatus: order.paymentStatus,
    subtotal: formatMoney(order.subtotal),
    discountType: order.discountType,
    discountValue: order.discountValue ? order.discountValue.toString() : null,
    discountAmount: formatMoney(order.discountAmount),
    taxAmount: formatMoney(order.taxAmount),
    totalAmount: formatMoney(order.totalAmount),
    paidAmount: formatMoney(order.paidAmount),
    refundedAmount: formatMoney(order.refundedAmount),
    returnedAmount: formatMoney(order.returnedAmount),
    balanceDue: calculateBalanceDue(order),
    notes: order.notes,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    confirmedAt: order.confirmedAt,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    customer: order.customer,
    createdBy: order.createdBy,
    confirmedBy: order.confirmedBy,
    completedBy: order.completedBy,
    cancelledBy: order.cancelledBy,
    items: order.items.map(mapOrderItem),
    payments: order.payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      type: p.type,
      amount: formatMoney(p.amount),
      paidAt: p.paidAt,
      reference: p.reference,
      paymentMethod: p.paymentMethod,
      recordedBy: p.recordedBy,
    })),
  };
}

export async function listOrders(query: ListOrdersQuery): Promise<Paginated<OrderListItem>> {
  const extraWhere: Prisma.OrderWhereInput[] = [];
  if (query.customerId) extraWhere.push({ customerId: query.customerId });
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

  const args = buildListArgs<OrderSortField, Prisma.OrderWhereInput, Prisma.OrderOrderByWithRelationInput>(
    query,
    {
      searchFields: ['orderNumber', 'invoiceNumber', 'customerName', 'customerPhone'],
      sortFields: {
        orderNumber: 'orderNumber',
        createdAt: 'createdAt',
        confirmedAt: 'confirmedAt',
        totalAmount: 'totalAmount',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    extraWhere,
  );

  return paginate(
    query,
    async () => {
      const rows = await prisma.order.findMany({
        ...args,
        select: {
          id: true,
          orderNumber: true,
          invoiceNumber: true,
          customerId: true,
          customerName: true,
          customerPhone: true,
          status: true,
          paymentStatus: true,
          subtotal: true,
          discountAmount: true,
          taxAmount: true,
          totalAmount: true,
          paidAmount: true,
          refundedAmount: true,
          returnedAmount: true,
          confirmedAt: true,
          createdAt: true,
          _count: { select: { items: true } },
        },
      });

      return rows.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        invoiceNumber: order.invoiceNumber,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        status: order.status,
        paymentStatus: order.paymentStatus,
        subtotal: formatMoney(order.subtotal),
        discountAmount: formatMoney(order.discountAmount),
        taxAmount: formatMoney(order.taxAmount),
        totalAmount: formatMoney(order.totalAmount),
        paidAmount: formatMoney(order.paidAmount),
        balanceDue: calculateBalanceDue(order),
        itemCount: order._count.items,
        confirmedAt: order.confirmedAt,
        createdAt: order.createdAt,
      }));
    },
    () => prisma.order.count({ where: args.where }),
  );
}

export async function updateOrder(
  id: string,
  input: UpdateOrderInput,
  actor: OrderActor,
): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked) throw notFound('Order');

    if (locked.status !== 'DRAFT') {
      throw conflict(`Cannot update order in status ${locked.status}`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    let customerName = input.customerName;
    let customerPhone = input.customerPhone;
    let customerAddress = input.customerAddress;

    if (input.customerId !== undefined) {
      if (input.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: input.customerId } });
        if (!customer) throw invalidReference('customerId', 'Customer not found');
        if (customer.status !== 'ACTIVE') {
          throw businessRule('Customer is not active', [
            { field: 'customerId', message: 'Only active customers can place orders' },
          ]);
        }
        customerName = customerName ?? customer.name;
        customerPhone = customerPhone ?? customer.phone;
        customerAddress = customerAddress ?? customer.address;
      } else {
        // Walk-in customer
        customerName = customerName ?? null;
        customerPhone = customerPhone ?? null;
        customerAddress = customerAddress ?? null;
      }
    }

    if (input.items !== undefined || input.discountType !== undefined || input.discountValue !== undefined) {
      // Re-calculate
      let currentItems = input.items;
      if (!currentItems) {
        const existingLines = await tx.orderItem.findMany({ where: { orderId: id } });
        currentItems = existingLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice.toString(),
          discountAmount: l.discountAmount.toString(),
          taxRate: l.taxRate.toString(),
        }));
      }

      const existingOrder = await tx.order.findUniqueOrThrow({ where: { id } });
      const discountType = input.discountType !== undefined ? input.discountType : existingOrder.discountType;
      const discountValue =
        input.discountValue !== undefined
          ? input.discountValue
          : existingOrder.discountValue
            ? existingOrder.discountValue.toString()
            : null;

      const { calculationResult, productMap } = await validateAndCalculateLines(
        tx,
        currentItems,
        discountType,
        discountValue,
        actor,
      );

      // Replace items
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      for (let i = 0; i < calculationResult.lines.length; i++) {
        const line = calculationResult.lines[i]!;
        const product = productMap.get(line.productId)!;
        await tx.orderItem.create({
          data: {
            orderId: id,
            productId: line.productId,
            lineNo: i + 1,
            productName: product.name,
            productSku: product.sku,
            unit: product.unit,
            quantity: line.quantity,
            unitPrice: line.unitCostOrPrice,
            unitCost: product.costPrice,
            discountAmount: line.lineDiscount,
            allocatedDiscount: line.allocatedDiscount,
            taxRate: line.taxRate,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
          },
        });
      }

      await tx.order.update({
        where: { id },
        data: {
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
          ...(customerName !== undefined ? { customerName } : {}),
          ...(customerPhone !== undefined ? { customerPhone } : {}),
          ...(customerAddress !== undefined ? { customerAddress } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          subtotal: calculationResult.subtotal,
          discountType: calculationResult.discountType,
          discountValue: calculationResult.discountValue,
          discountAmount: calculationResult.discountAmount,
          taxAmount: calculationResult.taxAmount,
          totalAmount: calculationResult.totalAmount,
        },
      });
    } else {
      await tx.order.update({
        where: { id },
        data: {
          ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
          ...(customerName !== undefined ? { customerName } : {}),
          ...(customerPhone !== undefined ? { customerPhone } : {}),
          ...(customerAddress !== undefined ? { customerAddress } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
        },
      });
    }

    await recordAudit(tx, actor, {
      action: 'order.updated',
      entityType: 'order',
      entityId: id,
      metadata: { id },
    });

    return getOrderWithTx(tx, id);
  });
}

export async function deleteOrder(id: string, ctx: RequestContext): Promise<void> {
  return withTransaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ id: string; status: OrderStatus; order_number: string }[]>`
      SELECT id, status, order_number FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked) throw notFound('Order');

    if (locked.status !== 'DRAFT') {
      throw conflict(`Cannot delete order in status ${locked.status}`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    await tx.order.delete({ where: { id } });

    await recordAudit(tx, ctx, {
      action: 'order.deleted',
      entityType: 'order',
      entityId: id,
      metadata: { orderNumber: locked.order_number },
    });
  });
}

export async function confirmOrder(id: string, ctx: RequestContext): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    // 1. Lock order header (BR-CONC-01)
    const [locked] = await tx.$queryRaw<{
      id: string;
      status: OrderStatus;
      customer_id: string | null;
      invoice_number: string | null;
    }[]>`
      SELECT id, status, customer_id, invoice_number FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked) throw notFound('Order');

    if (locked.status !== 'DRAFT') {
      throw conflict(`Cannot confirm order in status ${locked.status}`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    // Validate customer active
    if (locked.customer_id) {
      const customer = await tx.customer.findUnique({ where: { id: locked.customer_id } });
      if (customer && customer.status !== 'ACTIVE') {
        throw businessRule('Customer is not active', [
          { field: 'customerId', message: 'Customer is not active' },
        ]);
      }
    }

    const items = await tx.orderItem.findMany({
      where: { orderId: id },
      orderBy: { lineNo: 'asc' },
    });
    if (items.length === 0) {
      throw businessRule('Cannot confirm an order with no line items');
    }

    // 2. Lock products in ascending id order (BR-CONC-01)
    const sortedProductIds = [...new Set(items.map((i) => i.productId))].sort();
    const lockedProducts = await tx.$queryRaw<
      { id: string; stock_quantity: number; cost_price: Prisma.Decimal; status: string; name: string; sku: string }[]
    >`
      SELECT id, stock_quantity, cost_price, status, name, sku
      FROM products
      WHERE id IN (${Prisma.join(sortedProductIds.map((pid) => Prisma.sql`${pid}::uuid`))})
      ORDER BY id ASC
      FOR UPDATE`;

    const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

    // Check products active and sufficient stock (BR-ORD-03)
    const insufficientStockErrors: { field: string; message: string }[] = [];
    for (const item of items) {
      const p = productMap.get(item.productId);
      if (!p) throw notFound('Product');
      if (p.status !== 'ACTIVE') {
        throw businessRule(`Product "${p.name}" is not active`, [
          { field: 'items', message: `Product ${p.sku} is not active` },
        ]);
      }
      if (p.stock_quantity < item.quantity) {
        insufficientStockErrors.push({
          field: `items.${item.productId}`,
          message: `Insufficient stock for product "${p.name}" (${p.sku}): ${p.stock_quantity} available, ${item.quantity} requested`,
        });
      }
    }

    if (insufficientStockErrors.length > 0) {
      throw businessRule(
        `Insufficient stock for ${insufficientStockErrors.length} item(s)`,
        insufficientStockErrors,
      );
    }

    // 3. Deduct stock for each line using applyMovement (type: SALE) and snapshot unit cost (BR-ORD-03)
    for (const item of items) {
      const p = productMap.get(item.productId)!;
      await applyMovement(tx, {
        productId: item.productId,
        type: 'SALE',
        quantity: item.quantity,
        orderId: id,
        performedById: ctx.actorId!,
      });

      // Snapshot unit cost as current WAC at confirmation
      await tx.orderItem.update({
        where: { id: item.id },
        data: { unitCost: p.cost_price },
      });
    }

    // 4. Allocate gap-free invoice number (BR-ORD-07, BR-GEN-05)
    const invoiceNumber = await nextDocumentNumber(tx, 'INVOICE');
    const now = new Date();

    await tx.order.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        invoiceNumber,
        confirmedById: ctx.actorId!,
        confirmedAt: now,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'order.confirmed',
      entityType: 'order',
      entityId: id,
      metadata: { invoiceNumber },
    });

    return getOrderWithTx(tx, id);
  });
}

export async function cancelOrder(
  id: string,
  input: CancelOrderInput,
  actor: OrderActor,
): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    // 1. Lock order header (BR-CONC-01)
    const [order] = await tx.$queryRaw<{
      id: string;
      status: OrderStatus;
      paid_amount: Prisma.Decimal;
      refunded_amount: Prisma.Decimal;
    }[]>`
      SELECT id, status, paid_amount, refunded_amount FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!order) throw notFound('Order');

    if (order.status === 'CANCELLED') {
      throw conflict('Order is already cancelled', ErrorCode.INVALID_STATE_TRANSITION);
    }

    if (order.status === 'SHIPPED' || order.status === 'DELIVERED' || order.status === 'COMPLETED') {
      throw conflict(
        `Cannot cancel an order in ${order.status} status. Returns must be used instead.`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    const now = new Date();

    if (order.status === 'DRAFT') {
      // Draft cancellation never affects stock (BR-ORD-01)
      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledById: actor.actorId!,
          cancelledAt: now,
          cancellationReason: input.reason ?? null,
        },
      });

      await recordAudit(tx, actor, {
        action: 'order.cancelled',
        entityType: 'order',
        entityId: id,
        metadata: { fromStatus: 'DRAFT', reason: input.reason },
      });

      return getOrderWithTx(tx, id);
    }

    if (order.status === 'CONFIRMED') {
      // Cancelling confirmed order requires orders.cancel permission
      if (actor.canCancelConfirmed === false) {
        throw forbidden('You do not have permission to cancel a confirmed order');
      }

      // Check non-refunded payments
      const netPaid = new Prisma.Decimal(order.paid_amount).sub(order.refunded_amount);
      if (netPaid.greaterThan(0)) {
        throw businessRule(
          'Cannot cancel order with non-refunded payments. Refund payments first.',
          [{ field: 'paidAmount', message: `Order has ${netPaid.toFixed(2)} in non-refunded payments` }],
        );
      }

      // Restore stock with SALE_CANCELLATION at snapshotted unit cost (BR-ORD-06)
      const items = await tx.orderItem.findMany({
        where: { orderId: id },
        orderBy: { lineNo: 'asc' },
      });

      // Lock products in ascending id order
      const sortedProductIds = [...new Set(items.map((i) => i.productId))].sort();
      await tx.$queryRaw`
        SELECT id FROM products
        WHERE id IN (${Prisma.join(sortedProductIds.map((pid) => Prisma.sql`${pid}::uuid`))})
        ORDER BY id ASC
        FOR UPDATE`;

      for (const item of items) {
        await applyMovement(tx, {
          productId: item.productId,
          type: 'SALE_CANCELLATION',
          quantity: item.quantity,
          unitCost: item.unitCost ?? undefined,
          orderId: id,
          performedById: actor.actorId!,
        });
      }

      await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledById: actor.actorId!,
          cancelledAt: now,
          cancellationReason: input.reason ?? null,
        },
      });

      await recordAudit(tx, actor, {
        action: 'order.cancelled',
        entityType: 'order',
        entityId: id,
        metadata: { fromStatus: 'CONFIRMED', reason: input.reason },
      });

      return getOrderWithTx(tx, id);
    }

    throw conflict(`Cannot cancel order in status ${order.status}`, ErrorCode.INVALID_STATE_TRANSITION);
  });
}

export async function shipOrder(
  id: string,
  input: ShipOrderInput,
  ctx: RequestContext,
): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!order) throw notFound('Order');

    if (order.status !== 'CONFIRMED') {
      throw conflict(`Cannot ship order in ${order.status} status`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    const now = new Date();
    await tx.order.update({
      where: { id },
      data: {
        status: 'SHIPPED',
        carrier: input.carrier ?? null,
        trackingNumber: input.trackingNumber ?? null,
        shippedAt: now,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'order.shipped',
      entityType: 'order',
      entityId: id,
      metadata: { carrier: input.carrier, trackingNumber: input.trackingNumber },
    });

    return getOrderWithTx(tx, id);
  });
}

export async function deliverOrder(id: string, ctx: RequestContext): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!order) throw notFound('Order');

    if (order.status !== 'SHIPPED') {
      throw conflict(`Cannot deliver order in ${order.status} status`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    const now = new Date();
    await tx.order.update({
      where: { id },
      data: {
        status: 'DELIVERED',
        deliveredAt: now,
        completedAt: now,
        completedById: ctx.actorId!,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'order.delivered',
      entityType: 'order',
      entityId: id,
      metadata: { id },
    });

    return getOrderWithTx(tx, id);
  });
}

export async function completeOrder(id: string, ctx: RequestContext): Promise<OrderDetail> {
  return withTransaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ id: string; status: OrderStatus }[]>`
      SELECT id, status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    if (!order) throw notFound('Order');

    if (order.status !== 'CONFIRMED' && order.status !== 'SHIPPED' && order.status !== 'DELIVERED') {
      throw conflict(`Cannot complete order in ${order.status} status`, ErrorCode.INVALID_STATE_TRANSITION);
    }

    const now = new Date();
    await tx.order.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: now,
        completedById: ctx.actorId!,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'order.completed',
      entityType: 'order',
      entityId: id,
      metadata: { id },
    });

    return getOrderWithTx(tx, id);
  });
}

export async function getInvoice(id: string): Promise<OrderInvoiceDetail> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        select: orderItemSelect,
        orderBy: { lineNo: 'asc' },
      },
    },
  });

  if (!order) throw notFound('Order');
  if (!order.invoiceNumber || !order.confirmedAt) {
    throw conflict('Invoice is not generated for unconfirmed orders', ErrorCode.INVALID_STATE_TRANSITION);
  }

  const settings = await prisma.businessSetting.findUniqueOrThrow({ where: { id: 1 } });

  return {
    invoiceNumber: order.invoiceNumber,
    status: order.status === 'CANCELLED' ? 'CANCELLED' : 'ISSUED',
    issueDate: order.confirmedAt,
    dueDate: order.confirmedAt,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    paymentStatus: order.paymentStatus,
    business: {
      businessName: settings.businessName,
      currency: settings.currencyCode,
      taxEnabled: settings.taxEnabled,
      taxLabel: settings.taxLabel,
      taxId: settings.taxRegistrationNumber,
      email: settings.email,
      phone: settings.phone,
      address: settings.address,
      invoiceFooter: settings.invoiceFooter,
    },
    customer: {
      id: order.customerId,
      name: order.customerName,
      phone: order.customerPhone,
      address: order.customerAddress,
    },
    items: order.items.map(mapOrderItem),
    subtotal: formatMoney(order.subtotal),
    discountAmount: formatMoney(order.discountAmount),
    taxAmount: formatMoney(order.taxAmount),
    totalAmount: formatMoney(order.totalAmount),
    paidAmount: formatMoney(order.paidAmount),
    balanceDue: calculateBalanceDue(order),
  };
}
