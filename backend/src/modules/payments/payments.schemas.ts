import { z } from 'zod';
import { listQuerySchema, queryDate, queryEnumList } from '../../common/query/list-query';
import { decimalString, optionalText, uuidSchema } from '../../common/validation/schemas';

export const PAYMENTS_SORT_FIELDS = ['paymentNumber', 'createdAt', 'paidAt', 'amount'] as const;
export type PaymentSortField = (typeof PAYMENTS_SORT_FIELDS)[number];

export const recordPaymentSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: decimalString(12, 2),
  paidAt: z.string().optional().nullable(),
  reference: optionalText(100),
  notes: optionalText(2000),
});

export const recordRefundSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: decimalString(12, 2),
  paidAt: z.string().optional().nullable(),
  reference: optionalText(100),
  notes: optionalText(2000),
});

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(1, 'Reversal reason is required').max(500, 'Reason cannot exceed 500 characters'),
});

export const listPaymentsQuerySchema = listQuerySchema(PAYMENTS_SORT_FIELDS).extend({
  orderId: uuidSchema.optional(),
  purchaseId: uuidSchema.optional(),
  paymentMethodId: uuidSchema.optional(),
  type: queryEnumList(['PAYMENT', 'REFUND', 'REVERSAL']),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type RecordRefundInput = z.infer<typeof recordRefundSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
