import { z } from 'zod';
import { listQuerySchema, queryDate, queryEnumList } from '../../common/query/list-query';
import { decimalString, optionalText, uuidSchema } from '../../common/validation/schemas';

export const PURCHASES_SORT_FIELDS = ['purchaseNumber', 'createdAt', 'orderedAt', 'totalAmount'] as const;
export type PurchaseSortField = (typeof PURCHASES_SORT_FIELDS)[number];

export const purchaseItemInputSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitCost: decimalString(12, 2),
  discountAmount: decimalString(12, 2).optional().nullable(),
  taxRate: decimalString(3, 4).optional().nullable(),
});

export const createPurchaseSchema = z.object({
  supplierId: uuidSchema,
  supplierReference: optionalText(100),
  expectedDeliveryDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional()
    .nullable(),
  notes: optionalText(5000),
  discountType: z.enum(['FIXED', 'PERCENTAGE']).optional().nullable(),
  discountValue: decimalString(10, 4).optional().nullable(),
  items: z.array(purchaseItemInputSchema).min(1, 'At least one item is required'),
});

export const updatePurchaseSchema = z
  .object({
    supplierId: uuidSchema.optional(),
    supplierReference: optionalText(100),
    expectedDeliveryDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
      .optional()
      .nullable(),
    notes: optionalText(5000),
    discountType: z.enum(['FIXED', 'PERCENTAGE']).optional().nullable(),
    discountValue: decimalString(10, 4).optional().nullable(),
    items: z.array(purchaseItemInputSchema).min(1, 'At least one item is required').optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });

export const listPurchasesQuerySchema = listQuerySchema(PURCHASES_SORT_FIELDS).extend({
  supplierId: uuidSchema.optional(),
  status: queryEnumList(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']),
  paymentStatus: queryEnumList(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export const receiveGoodsItemSchema = z.object({
  purchaseItemId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

export const receiveGoodsSchema = z.object({
  notes: optionalText(2000),
  items: z.array(receiveGoodsItemSchema).min(1, 'At least one receipt item is required'),
});

export type PurchaseItemInput = z.infer<typeof purchaseItemInputSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;
export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;
export type ReceiveGoodsItemInput = z.infer<typeof receiveGoodsItemSchema>;
