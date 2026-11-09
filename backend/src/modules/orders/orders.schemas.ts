import { z } from 'zod';
import { listQuerySchema, queryDate, queryEnumList } from '../../common/query/list-query';
import { decimalString, optionalText, uuidSchema } from '../../common/validation/schemas';

export const ORDERS_SORT_FIELDS = ['orderNumber', 'createdAt', 'confirmedAt', 'totalAmount'] as const;
export type OrderSortField = (typeof ORDERS_SORT_FIELDS)[number];

export const orderItemInputSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  unitPrice: decimalString(12, 2).optional().nullable(),
  discountAmount: decimalString(12, 2).optional().nullable(),
  taxRate: decimalString(3, 4).optional().nullable(),
});

export const createOrderSchema = z.object({
  customerId: uuidSchema.optional().nullable(),
  customerName: optionalText(150),
  customerPhone: optionalText(30),
  customerAddress: optionalText(1000),
  notes: optionalText(5000),
  discountType: z.enum(['FIXED', 'PERCENTAGE']).optional().nullable(),
  discountValue: decimalString(10, 4).optional().nullable(),
  items: z.array(orderItemInputSchema).min(1, 'At least one item is required'),
});

export const updateOrderSchema = z
  .object({
    customerId: uuidSchema.optional().nullable(),
    customerName: optionalText(150),
    customerPhone: optionalText(30),
    customerAddress: optionalText(1000),
    notes: optionalText(5000),
    discountType: z.enum(['FIXED', 'PERCENTAGE']).optional().nullable(),
    discountValue: decimalString(10, 4).optional().nullable(),
    items: z.array(orderItemInputSchema).min(1, 'At least one item is required').optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });

export const cancelOrderSchema = z.object({
  reason: optionalText(500),
});

export const shipOrderSchema = z.object({
  carrier: optionalText(100),
  trackingNumber: optionalText(100),
});

export const listOrdersQuerySchema = listQuerySchema(ORDERS_SORT_FIELDS).extend({
  customerId: uuidSchema.optional(),
  status: queryEnumList(['DRAFT', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED']),
  paymentStatus: queryEnumList(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED']),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
