import { Prisma, type OrderStatus, type PaymentStatus, type PaymentType, type PurchaseStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { recordAudit, type RequestContext } from '../../common/audit/audit';
import { withIdempotentTransaction, type Tx } from '../../common/db/transaction';
import { ErrorCode, businessRule, conflict, invalidReference, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { nextDocumentNumber } from '../../common/sequence/document-sequence';
import { publicUserSelect } from '../users/users.presenter';
import type {
  ListPaymentsQuery,
  PaymentSortField,
  RecordPaymentInput,
  RecordRefundInput,
  ReversePaymentInput,
} from './payments.schemas';

export interface PaymentDetail {
  id: string;
  paymentNumber: string;
  type: PaymentType;
  orderId: string | null;
  purchaseId: string | null;
  salesReturnId?: string | null;
  amount: string;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  reversedPaymentId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  paymentMethod: {
    id: string;
    code: string;
    name: string;
  };
  recordedBy: unknown;
  reversedBy?: {
    id: string;
    paymentNumber: string;
    createdAt: Date;
  } | null;
}

const paymentSelect = {
  id: true,
  paymentNumber: true,
  type: true,
  orderId: true,
  purchaseId: true,
  salesReturnId: true,
  amount: true,
  paidAt: true,
  reference: true,
  notes: true,
  reversedPaymentId: true,
  idempotencyKey: true,
  createdAt: true,
  paymentMethod: { select: { id: true, code: true, name: true } },
  recordedBy: { select: publicUserSelect },
  reversal: { select: { id: true, paymentNumber: true, createdAt: true } },
} as const;

function formatMoney(value: Prisma.Decimal | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

function mapPayment(p: {
  id: string;
  paymentNumber: string;
  type: PaymentType;
  orderId: string | null;
  purchaseId: string | null;
  salesReturnId?: string | null;
  amount: Prisma.Decimal;
  paidAt: Date;
  reference: string | null;
  notes: string | null;
  reversedPaymentId: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
  paymentMethod: { id: string; code: string; name: string };
  recordedBy: unknown;
  reversal?: { id: string; paymentNumber: string; createdAt: Date } | null;
}): PaymentDetail {
  return {
    id: p.id,
    paymentNumber: p.paymentNumber,
    type: p.type,
    orderId: p.orderId,
    purchaseId: p.purchaseId,
    salesReturnId: p.salesReturnId ?? null,
    amount: formatMoney(p.amount),
    paidAt: p.paidAt,
    reference: p.reference,
    notes: p.notes,
    reversedPaymentId: p.reversedPaymentId,
    idempotencyKey: p.idempotencyKey,
    createdAt: p.createdAt,
    paymentMethod: p.paymentMethod,
    recordedBy: p.recordedBy,
    reversedBy: p.reversal ?? null,
  };
}

export function computeOrderPaymentStatus(
  effectiveTotal: Prisma.Decimal,
  paidAmount: Prisma.Decimal,
  refundedAmount: Prisma.Decimal,
): PaymentStatus {
  const netPaid = paidAmount.sub(refundedAmount);
  if (refundedAmount.greaterThan(0)) {
    return netPaid.isZero() ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  }
  if (paidAmount.isZero()) {
    return effectiveTotal.isZero() ? 'PAID' : 'UNPAID';
  }
  if (netPaid.greaterThanOrEqualTo(effectiveTotal)) {
    return 'PAID';
  }
  return 'PARTIALLY_PAID';
}

type PaymentRow = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>;

async function findReplayedPayment(
  db: Tx | typeof prisma,
  idempotencyKey: string,
  matches: (existing: PaymentRow) => boolean,
): Promise<{ replayed: boolean; payment: PaymentDetail } | null> {
  const existing = await db.payment.findUnique({
    where: { idempotencyKey },
    select: paymentSelect,
  });
  if (!existing) return null;
  if (!matches(existing)) {
    throw conflict('Idempotency key reused with different payload', ErrorCode.IDEMPOTENCY_KEY_REUSED);
  }
  return { replayed: true, payment: mapPayment(existing) };
}

async function validateMethodAndDate(
  tx: Tx,
  paymentMethodId: string,
  paidAtInput?: string | null,
): Promise<Date> {
  const method = await tx.paymentMethod.findUnique({ where: { id: paymentMethodId } });
  if (!method) throw invalidReference('paymentMethodId', 'Payment method not found');
  if (!method.isActive) {
    throw businessRule('Payment method is not active', [
      { field: 'paymentMethodId', message: `Method "${method.name}" is deactivated` },
    ]);
  }

  const now = new Date();
  const paidAt = paidAtInput ? new Date(paidAtInput) : now;
  if (Number.isNaN(paidAt.getTime())) {
    throw businessRule('Invalid payment date', [{ field: 'paidAt', message: 'Invalid paidAt timestamp' }]);
  }
  if (paidAt.getTime() > now.getTime() + 60_000) {
    throw businessRule('Payment date cannot be in the future', [
      { field: 'paidAt', message: 'paidAt cannot be in the future' },
    ]);
  }
  return paidAt;
}

function parsePositiveAmount(raw: string, label: 'Payment' | 'Refund'): Prisma.Decimal {
  const amount = new Prisma.Decimal(raw);
  if (amount.lessThanOrEqualTo(0)) {
    throw businessRule(`${label} amount must be greater than zero`, [
      { field: 'amount', message: 'Must be positive' },
    ]);
  }
  return amount;
}

export async function recordOrderPayment(
  orderId: string,
  input: RecordPaymentInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  const matches = (existing: PaymentRow) =>
    existing.orderId === orderId &&
    existing.paymentMethod.id === input.paymentMethodId &&
    new Prisma.Decimal(existing.amount).equals(new Prisma.Decimal(input.amount)) &&
    existing.type === 'PAYMENT';

  return withIdempotentTransaction(
    async (tx) => {
      // 1. Lock order header first so concurrent retries serialize before reading balance/idempotency (BR-PAY-07, BR-CONC-01)
      const [order] = await tx.$queryRaw<
        {
          id: string;
          status: OrderStatus;
          total_amount: Prisma.Decimal;
          returned_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, returned_amount, paid_amount, refunded_amount
        FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE`;

      // 2. Idempotency replay check under lock (BR-IDEM-01, BR-PAY-09)
      if (idempotencyKey) {
        const replayed = await findReplayedPayment(tx, idempotencyKey, matches);
        if (replayed) return replayed;
      }

      if (!order) throw notFound('Order');

      // 3-4. Validate payment method & paidAt (BR-PAY-10)
      const paidAt = await validateMethodAndDate(tx, input.paymentMethodId, input.paidAt);

    // Customer payments allowed on CONFIRMED, SHIPPED, DELIVERED, COMPLETED (BR-PAY-02)
    const allowedStatuses: OrderStatus[] = ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED'];
    if (!allowedStatuses.includes(order.status)) {
      throw conflict(
        `Payments are not allowed on orders with status ${order.status}`,
        ErrorCode.INVALID_STATE_TRANSITION,
      );
    }

    // 5. Overpayment check (BR-PAY-03)
    const amount = parsePositiveAmount(input.amount, 'Payment');

    const effectiveTotal = new Prisma.Decimal(order.total_amount).sub(order.returned_amount);
    const netPaid = new Prisma.Decimal(order.paid_amount).sub(order.refunded_amount);
    const balanceDue = effectiveTotal.sub(netPaid);

    if (amount.greaterThan(balanceDue)) {
      throw businessRule(
        `Payment amount (${amount.toFixed(2)}) exceeds balance due (${balanceDue.toFixed(2)})`,
        [{ field: 'amount', message: `Overpayment is rejected. Balance due is ${balanceDue.toFixed(2)}` }],
      );
    }

    // 6. Allocate payment document number (PAY-XXXXXX)
    const paymentNumber = await nextDocumentNumber(tx, 'PAYMENT');

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        type: 'PAYMENT',
        orderId,
        paymentMethodId: input.paymentMethodId,
        amount,
        paidAt,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        idempotencyKey: idempotencyKey ?? null,
        recordedById: ctx.actorId!,
      },
      include: {
        paymentMethod: { select: { id: true, code: true, name: true } },
        recordedBy: { select: publicUserSelect },
      },
    });

    // 7. Update order aggregates and payment status (BR-PAY-03, BR-PAY-06)
    const newPaidAmount = new Prisma.Decimal(order.paid_amount).add(amount);
    const newPaymentStatus = computeOrderPaymentStatus(
      effectiveTotal,
      newPaidAmount,
      new Prisma.Decimal(order.refunded_amount),
    );

    await tx.order.update({
      where: { id: orderId },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'payment.recorded',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        paymentNumber,
        orderId,
        amount: amount.toString(),
        paymentStatus: newPaymentStatus,
      },
    });

    return { replayed: false, payment: mapPayment(payment) };
  },
  {
    idempotencyKey,
    onReplay: () =>
      idempotencyKey ? findReplayedPayment(prisma, idempotencyKey, matches) : Promise.resolve(null),
  });
}

export async function recordOrderRefund(
  orderId: string,
  input: RecordRefundInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  const matches = (existing: PaymentRow) =>
    existing.orderId === orderId &&
    existing.paymentMethod.id === input.paymentMethodId &&
    new Prisma.Decimal(existing.amount).equals(new Prisma.Decimal(input.amount)) &&
    existing.type === 'REFUND' &&
    existing.salesReturnId === (input.salesReturnId ?? null);

  return withIdempotentTransaction(
    async (tx) => {
      // 1. Lock order header first so concurrent retries serialize before reading balance/idempotency
      const [order] = await tx.$queryRaw<
        {
          id: string;
          status: OrderStatus;
          total_amount: Prisma.Decimal;
          returned_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, returned_amount, paid_amount, refunded_amount
        FROM orders
        WHERE id = ${orderId}::uuid
        FOR UPDATE`;

      // 2. Idempotency replay check under lock
      if (idempotencyKey) {
        const replayed = await findReplayedPayment(tx, idempotencyKey, matches);
        if (replayed) return replayed;
      }

      if (!order) throw notFound('Order');

      // 3-4. Validate payment method & paidAt (BR-PAY-10)
      const paidAt = await validateMethodAndDate(tx, input.paymentMethodId, input.paidAt);

    // 5. Refund limit check (BR-PAY-04)
    const amount = parsePositiveAmount(input.amount, 'Refund');

    const paidAmount = new Prisma.Decimal(order.paid_amount);
    const refundedAmount = new Prisma.Decimal(order.refunded_amount);
    const netPaid = paidAmount.sub(refundedAmount);

    if (amount.greaterThan(netPaid)) {
      throw businessRule(
        `Refund amount (${amount.toFixed(2)}) exceeds net paid amount (${netPaid.toFixed(2)})`,
        [{ field: 'amount', message: `Cannot refund more than net paid amount (${netPaid.toFixed(2)})` }],
      );
    }

    const effectiveTotal =
      order.status === 'CANCELLED'
        ? new Prisma.Decimal(0)
        : new Prisma.Decimal(order.total_amount).sub(order.returned_amount);
    const balanceDue = effectiveTotal.sub(netPaid);

    // If order is active and not cancelled, only negative balance (money owed back) can be refunded
    if (order.status !== 'CANCELLED') {
      if (balanceDue.greaterThanOrEqualTo(0)) {
        throw businessRule(
          'No refund is owed on an active order with non-negative balance due',
          [{ field: 'amount', message: 'Order has no refundable credit' }],
        );
      }
      const refundableCredit = balanceDue.negated();
      if (amount.greaterThan(refundableCredit)) {
        throw businessRule(
          `Refund amount (${amount.toFixed(2)}) exceeds refundable credit (${refundableCredit.toFixed(2)})`,
          [{ field: 'amount', message: `Maximum refundable credit is ${refundableCredit.toFixed(2)}` }],
        );
      }
    }

    if (input.salesReturnId) {
      const salesReturn = await tx.salesReturn.findUnique({ where: { id: input.salesReturnId } });
      if (!salesReturn || salesReturn.orderId !== orderId) {
        throw invalidReference('salesReturnId', 'Sales return not found for this order');
      }
      if (salesReturn.status !== 'COMPLETED') {
        throw conflict('Refunds can only be issued for completed sales returns', ErrorCode.INVALID_STATE_TRANSITION);
      }
      const existingRefunds = await tx.payment.findMany({
        where: { salesReturnId: input.salesReturnId, type: 'REFUND' },
        select: { amount: true, reversal: { select: { id: true } } },
      });
      const activeRefunds = existingRefunds.filter((r) => !r.reversal);
      const refundedForReturn = activeRefunds.reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0));
      const remainingReturnAmount = new Prisma.Decimal(salesReturn.totalAmount).sub(refundedForReturn);
      if (amount.greaterThan(remainingReturnAmount)) {
        throw businessRule(
          `Refund amount (${amount.toFixed(2)}) exceeds remaining unrefunded return amount (${remainingReturnAmount.toFixed(2)})`,
          [{ field: 'amount', message: `Maximum refundable for this return is ${remainingReturnAmount.toFixed(2)}` }],
        );
      }
    }

    // 6. Allocate payment number
    const paymentNumber = await nextDocumentNumber(tx, 'PAYMENT');

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        type: 'REFUND',
        orderId,
        salesReturnId: input.salesReturnId ?? null,
        paymentMethodId: input.paymentMethodId,
        amount,
        paidAt,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        idempotencyKey: idempotencyKey ?? null,
        recordedById: ctx.actorId!,
      },
      include: {
        paymentMethod: { select: { id: true, code: true, name: true } },
        recordedBy: { select: publicUserSelect },
      },
    });

    // 7. Update order aggregates
    const newRefundedAmount = refundedAmount.add(amount);
    const newPaymentStatus = computeOrderPaymentStatus(
      effectiveTotal,
      paidAmount,
      newRefundedAmount,
    );

    await tx.order.update({
      where: { id: orderId },
      data: {
        refundedAmount: newRefundedAmount,
        paymentStatus: newPaymentStatus,
      },
    });

    await recordAudit(tx, ctx, {
      action: 'payment.refunded',
      entityType: 'payment',
      entityId: payment.id,
      metadata: {
        paymentNumber,
        orderId,
        salesReturnId: input.salesReturnId ?? null,
        amount: amount.toString(),
        paymentStatus: newPaymentStatus,
      },
    });

    return { replayed: false, payment: mapPayment(payment) };
  },
  {
    idempotencyKey,
    onReplay: () =>
      idempotencyKey ? findReplayedPayment(prisma, idempotencyKey, matches) : Promise.resolve(null),
  });
}

export async function reversePayment(
  id: string,
  input: ReversePaymentInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  const matches = (existing: PaymentRow) =>
    existing.reversedPaymentId === id && existing.type === 'REVERSAL';

  return withIdempotentTransaction(
    async (tx) => {
      // 1. Lock original payment first so concurrent retries serialize (BR-CONC-01)
      const [original] = await tx.$queryRaw<
        {
          id: string;
          payment_number: string;
          type: PaymentType;
          order_id: string | null;
          purchase_id: string | null;
          payment_method_id: string;
          amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, payment_number, type, order_id, purchase_id, payment_method_id, amount
        FROM payments
        WHERE id = ${id}::uuid
        FOR UPDATE`;

      // 2. Idempotency replay check under lock
      if (idempotencyKey) {
        const replayed = await findReplayedPayment(tx, idempotencyKey, matches);
        if (replayed) return replayed;
      }

      if (!original) throw notFound('Payment');

    if (original.type === 'REVERSAL') {
      throw conflict('Cannot reverse a reversal transaction', ErrorCode.INVALID_STATE_TRANSITION);
    }

    // Check if already reversed (BR-PAY-05)
    const existingReversal = await tx.payment.findUnique({
      where: { reversedPaymentId: id },
    });
    if (existingReversal) {
      throw conflict('Payment has already been reversed', ErrorCode.INVALID_STATE_TRANSITION);
    }

    // 3. Handle order balance updates
    if (original.order_id) {
      const [order] = await tx.$queryRaw<
        {
          id: string;
          status: OrderStatus;
          total_amount: Prisma.Decimal;
          returned_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, returned_amount, paid_amount, refunded_amount
        FROM orders
        WHERE id = ${original.order_id}::uuid
        FOR UPDATE`;

      if (order) {
        let paidAmount = new Prisma.Decimal(order.paid_amount);
        let refundedAmount = new Prisma.Decimal(order.refunded_amount);

        if (original.type === 'PAYMENT') {
          paidAmount = paidAmount.sub(original.amount);
          // Reversing payment rejected if it makes refunded_amount > paid_amount (BR-PAY-05)
          if (paidAmount.lessThan(refundedAmount)) {
            throw businessRule(
              'Cannot reverse payment: refunded amount would exceed paid amount',
              [{ field: 'amount', message: 'Reversal leaves refunded_amount > paid_amount' }],
            );
          }
        } else if (original.type === 'REFUND') {
          refundedAmount = refundedAmount.sub(original.amount);
        }

        const effectiveTotal =
          order.status === 'CANCELLED'
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(order.total_amount).sub(order.returned_amount);
        const newPaymentStatus = computeOrderPaymentStatus(effectiveTotal, paidAmount, refundedAmount);

        await tx.order.update({
          where: { id: original.order_id },
          data: {
            paidAmount,
            refundedAmount,
            paymentStatus: newPaymentStatus,
          },
        });
      }
    }

    // 4. Handle purchase balance updates if linked to a purchase
    if (original.purchase_id) {
      const [purchase] = await tx.$queryRaw<
        {
          id: string;
          status: PurchaseStatus;
          total_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, paid_amount, refunded_amount
        FROM purchases
        WHERE id = ${original.purchase_id}::uuid
        FOR UPDATE`;

      if (purchase) {
        let paidAmount = new Prisma.Decimal(purchase.paid_amount);
        let refundedAmount = new Prisma.Decimal(purchase.refunded_amount);

        if (original.type === 'PAYMENT') {
          paidAmount = paidAmount.sub(original.amount);
          if (paidAmount.lessThan(refundedAmount)) {
            throw businessRule('Cannot reverse payment: refunded amount would exceed paid amount');
          }
        } else if (original.type === 'REFUND') {
          refundedAmount = refundedAmount.sub(original.amount);
        }

        const effectiveTotal =
          purchase.status === 'CANCELLED'
            ? new Prisma.Decimal(0)
            : new Prisma.Decimal(purchase.total_amount);
        const newPaymentStatus = computeOrderPaymentStatus(effectiveTotal, paidAmount, refundedAmount);

        await tx.purchase.update({
          where: { id: original.purchase_id },
          data: {
            paidAmount,
            refundedAmount,
            paymentStatus: newPaymentStatus,
          },
        });
      }
    }

    // 5. Allocate reversal payment number
    const paymentNumber = await nextDocumentNumber(tx, 'PAYMENT');
    const reversal = await tx.payment.create({
      data: {
        paymentNumber,
        type: 'REVERSAL',
        orderId: original.order_id,
        purchaseId: original.purchase_id,
        paymentMethodId: original.payment_method_id,
        amount: original.amount,
        paidAt: new Date(),
        reversedPaymentId: id,
        notes: input.reason,
        idempotencyKey: idempotencyKey ?? null,
        recordedById: ctx.actorId!,
      },
      include: {
        paymentMethod: { select: { id: true, code: true, name: true } },
        recordedBy: { select: publicUserSelect },
      },
    });

    await recordAudit(tx, ctx, {
      action: 'payment.reversed',
      entityType: 'payment',
      entityId: reversal.id,
      metadata: {
        paymentNumber,
        originalPaymentId: id,
        originalPaymentNumber: original.payment_number,
        amount: original.amount.toString(),
        reason: input.reason,
      },
    });

    return { replayed: false, payment: mapPayment(reversal) };
  },
  {
    idempotencyKey,
    onReplay: () =>
      idempotencyKey ? findReplayedPayment(prisma, idempotencyKey, matches) : Promise.resolve(null),
  });
}

export async function getPayment(id: string): Promise<PaymentDetail> {
  const payment = await prisma.payment.findUnique({
    where: { id },
    select: paymentSelect,
  });

  if (!payment) throw notFound('Payment');
  return mapPayment(payment);
}

export async function listOrderPayments(orderId: string): Promise<PaymentDetail[]> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound('Order');

  const payments = await prisma.payment.findMany({
    where: { orderId },
    select: paymentSelect,
    orderBy: { createdAt: 'desc' },
  });

  return payments.map(mapPayment);
}

/** Records a supplier payment against an active confirmed/receiving purchase (BR-PAY-02, BR-PAY-03). */
export async function recordPurchasePayment(
  purchaseId: string,
  input: RecordPaymentInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  const matches = (existing: PaymentRow) =>
    existing.purchaseId === purchaseId &&
    existing.paymentMethod.id === input.paymentMethodId &&
    new Prisma.Decimal(existing.amount).equals(new Prisma.Decimal(input.amount)) &&
    existing.type === 'PAYMENT';

  return withIdempotentTransaction(
    async (tx) => {
      const [purchase] = await tx.$queryRaw<
        {
          id: string;
          status: PurchaseStatus;
          total_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, paid_amount, refunded_amount
        FROM purchases
        WHERE id = ${purchaseId}::uuid
        FOR UPDATE`;

      if (idempotencyKey) {
        const replayed = await findReplayedPayment(tx, idempotencyKey, matches);
        if (replayed) return replayed;
      }

      if (!purchase) throw notFound('Purchase');

      const paidAt = await validateMethodAndDate(tx, input.paymentMethodId, input.paidAt);

      const allowedStatuses: PurchaseStatus[] = ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'];
      if (!allowedStatuses.includes(purchase.status)) {
        throw conflict(
          `Payments are not allowed on purchases with status ${purchase.status}`,
          ErrorCode.INVALID_STATE_TRANSITION,
        );
      }

      const amount = parsePositiveAmount(input.amount, 'Payment');
      const effectiveTotal = new Prisma.Decimal(purchase.total_amount);
      const netPaid = new Prisma.Decimal(purchase.paid_amount).sub(purchase.refunded_amount);
      const balanceDue = effectiveTotal.sub(netPaid);

      if (amount.greaterThan(balanceDue)) {
        throw businessRule(
          `Payment amount (${amount.toFixed(2)}) exceeds balance due (${balanceDue.toFixed(2)})`,
          [{ field: 'amount', message: `Overpayment is rejected. Balance due is ${balanceDue.toFixed(2)}` }],
        );
      }

      const paymentNumber = await nextDocumentNumber(tx, 'PAYMENT');
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          type: 'PAYMENT',
          purchaseId,
          paymentMethodId: input.paymentMethodId,
          amount,
          paidAt,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          idempotencyKey: idempotencyKey ?? null,
          recordedById: ctx.actorId!,
        },
        include: {
          paymentMethod: { select: { id: true, code: true, name: true } },
          recordedBy: { select: publicUserSelect },
        },
      });

      const newPaidAmount = new Prisma.Decimal(purchase.paid_amount).add(amount);
      const newPaymentStatus = computeOrderPaymentStatus(
        effectiveTotal,
        newPaidAmount,
        new Prisma.Decimal(purchase.refunded_amount),
      );

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { paidAmount: newPaidAmount, paymentStatus: newPaymentStatus },
      });

      await recordAudit(tx, ctx, {
        action: 'payment.recorded',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          paymentNumber,
          purchaseId,
          amount: amount.toString(),
          paymentStatus: newPaymentStatus,
        },
      });

      return { replayed: false, payment: mapPayment(payment) };
    },
    {
      idempotencyKey,
      onReplay: () =>
        idempotencyKey ? findReplayedPayment(prisma, idempotencyKey, matches) : Promise.resolve(null),
    },
  );
}

/** Records a supplier refund against a cancelled or overpaid purchase (BR-PAY-04). */
export async function recordPurchaseRefund(
  purchaseId: string,
  input: RecordRefundInput,
  ctx: RequestContext,
  idempotencyKey?: string,
): Promise<{ replayed: boolean; payment: PaymentDetail }> {
  if (input.salesReturnId) {
    throw businessRule('Sales returns cannot be linked to supplier purchase refunds', [
      { field: 'salesReturnId', message: 'Not applicable to purchase refunds' },
    ]);
  }

  const matches = (existing: PaymentRow) =>
    existing.purchaseId === purchaseId &&
    existing.paymentMethod.id === input.paymentMethodId &&
    new Prisma.Decimal(existing.amount).equals(new Prisma.Decimal(input.amount)) &&
    existing.type === 'REFUND';

  return withIdempotentTransaction(
    async (tx) => {
      const [purchase] = await tx.$queryRaw<
        {
          id: string;
          status: PurchaseStatus;
          total_amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          refunded_amount: Prisma.Decimal;
        }[]
      >`
        SELECT id, status, total_amount, paid_amount, refunded_amount
        FROM purchases
        WHERE id = ${purchaseId}::uuid
        FOR UPDATE`;

      if (idempotencyKey) {
        const replayed = await findReplayedPayment(tx, idempotencyKey, matches);
        if (replayed) return replayed;
      }

      if (!purchase) throw notFound('Purchase');

      const paidAt = await validateMethodAndDate(tx, input.paymentMethodId, input.paidAt);
      const amount = parsePositiveAmount(input.amount, 'Refund');

      const paidAmount = new Prisma.Decimal(purchase.paid_amount);
      const refundedAmount = new Prisma.Decimal(purchase.refunded_amount);
      const netPaid = paidAmount.sub(refundedAmount);

      if (amount.greaterThan(netPaid)) {
        throw businessRule(
          `Refund amount (${amount.toFixed(2)}) exceeds net paid amount (${netPaid.toFixed(2)})`,
          [{ field: 'amount', message: `Cannot refund more than net paid amount (${netPaid.toFixed(2)})` }],
        );
      }

      const effectiveTotal =
        purchase.status === 'CANCELLED'
          ? new Prisma.Decimal(0)
          : new Prisma.Decimal(purchase.total_amount);
      const balanceDue = effectiveTotal.sub(netPaid);

      if (purchase.status !== 'CANCELLED') {
        if (balanceDue.greaterThanOrEqualTo(0)) {
          throw businessRule(
            'No refund is owed on an active purchase with non-negative balance due',
            [{ field: 'amount', message: 'Purchase has no refundable credit' }],
          );
        }
        const refundableCredit = balanceDue.negated();
        if (amount.greaterThan(refundableCredit)) {
          throw businessRule(
            `Refund amount (${amount.toFixed(2)}) exceeds refundable credit (${refundableCredit.toFixed(2)})`,
            [{ field: 'amount', message: `Maximum refundable credit is ${refundableCredit.toFixed(2)}` }],
          );
        }
      }

      const paymentNumber = await nextDocumentNumber(tx, 'PAYMENT');
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          type: 'REFUND',
          purchaseId,
          paymentMethodId: input.paymentMethodId,
          amount,
          paidAt,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          idempotencyKey: idempotencyKey ?? null,
          recordedById: ctx.actorId!,
        },
        include: {
          paymentMethod: { select: { id: true, code: true, name: true } },
          recordedBy: { select: publicUserSelect },
        },
      });

      const newRefundedAmount = refundedAmount.add(amount);
      const newPaymentStatus = computeOrderPaymentStatus(effectiveTotal, paidAmount, newRefundedAmount);

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { refundedAmount: newRefundedAmount, paymentStatus: newPaymentStatus },
      });

      await recordAudit(tx, ctx, {
        action: 'payment.refunded',
        entityType: 'payment',
        entityId: payment.id,
        metadata: {
          paymentNumber,
          purchaseId,
          amount: amount.toString(),
          paymentStatus: newPaymentStatus,
        },
      });

      return { replayed: false, payment: mapPayment(payment) };
    },
    {
      idempotencyKey,
      onReplay: () =>
        idempotencyKey ? findReplayedPayment(prisma, idempotencyKey, matches) : Promise.resolve(null),
    },
  );
}

/** Lists all payment ledger entries linked to a purchase. */
export async function listPurchasePayments(purchaseId: string): Promise<PaymentDetail[]> {
  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw notFound('Purchase');

  const payments = await prisma.payment.findMany({
    where: { purchaseId },
    select: paymentSelect,
    orderBy: { createdAt: 'desc' },
  });

  return payments.map(mapPayment);
}

export async function listPayments(query: ListPaymentsQuery): Promise<Paginated<PaymentDetail>> {
  const extraWhere: Prisma.PaymentWhereInput[] = [];
  if (query.orderId) extraWhere.push({ orderId: query.orderId });
  if (query.purchaseId) extraWhere.push({ purchaseId: query.purchaseId });
  if (query.paymentMethodId) extraWhere.push({ paymentMethodId: query.paymentMethodId });
  if (query.type) extraWhere.push({ type: { in: query.type } });

  if (query.from || query.to) {
    extraWhere.push({
      paidAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const args = buildListArgs<PaymentSortField, Prisma.PaymentWhereInput, Prisma.PaymentOrderByWithRelationInput>(
    query,
    {
      sortFields: {
        paymentNumber: 'paymentNumber',
        createdAt: 'createdAt',
        paidAt: 'paidAt',
        amount: 'amount',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    extraWhere,
  );

  return paginate(
    query,
    async () => {
      const rows = await prisma.payment.findMany({
        ...args,
        select: paymentSelect,
      });
      return rows.map(mapPayment);
    },
    () => prisma.payment.count({ where: args.where }),
  );
}
