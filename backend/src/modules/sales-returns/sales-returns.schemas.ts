import { z } from 'zod';
import { listQuerySchema, queryDate, queryEnumList } from '../../common/query/list-query';
import { decimalString, optionalText, uuidSchema } from '../../common/validation/schemas';

export const SALES_RETURNS_SORT_FIELDS = ['returnNumber', 'createdAt', 'processedAt', 'totalAmount', 'status'] as const;
export type SalesReturnSortField = (typeof SALES_RETURNS_SORT_FIELDS)[number];

export const returnItemConditionEnum = z.enum(['RESALABLE', 'DAMAGED']);
export type ReturnItemCondition = z.infer<typeof returnItemConditionEnum>;

export const salesReturnStatusEnum = z.enum(['PENDING', 'COMPLETED', 'REJECTED']);
export type SalesReturnStatus = z.infer<typeof salesReturnStatusEnum>;

export const createSalesReturnItemSchema = z.object({
  orderItemId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  condition: returnItemConditionEnum,
});

export const createSalesReturnSchema = z.object({
  orderId: uuidSchema,
  reason: z.string().trim().min(1, 'Return reason is required').max(500, 'Reason cannot exceed 500 characters'),
  notes: optionalText(2000),
  items: z.array(createSalesReturnItemSchema).min(1, 'At least one return line is required'),
});

export const completeSalesReturnSchema = z.object({
  notes: optionalText(2000),
});

export const rejectSalesReturnSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(500, 'Rejection reason cannot exceed 500 characters'),
});

export const refundSalesReturnSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: decimalString(12, 2).optional(),
  paidAt: z.string().optional().nullable(),
  reference: optionalText(100),
  notes: optionalText(2000),
});

export const listSalesReturnsQuerySchema = listQuerySchema(SALES_RETURNS_SORT_FIELDS).extend({
  orderId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
  status: queryEnumList(['PENDING', 'COMPLETED', 'REJECTED']),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export type CreateSalesReturnInput = z.infer<typeof createSalesReturnSchema>;
export type CompleteSalesReturnInput = z.infer<typeof completeSalesReturnSchema>;
export type RejectSalesReturnInput = z.infer<typeof rejectSalesReturnSchema>;
export type RefundSalesReturnInput = z.infer<typeof refundSalesReturnSchema>;
export type ListSalesReturnsQuery = z.infer<typeof listSalesReturnsQuerySchema>;
