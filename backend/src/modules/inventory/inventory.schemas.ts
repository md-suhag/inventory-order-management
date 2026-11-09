import { z } from 'zod';
import { listQuerySchema, queryDate, queryEnumList } from '../../common/query/list-query';
import { optionalText, uuidSchema } from '../../common/validation/schemas';

export const INVENTORY_SORT_FIELDS = ['name', 'sku', 'stockQuantity', 'createdAt'] as const;
export type InventorySortField = (typeof INVENTORY_SORT_FIELDS)[number];

export const MOVEMENT_SORT_FIELDS = ['createdAt', 'quantityChange'] as const;
export type MovementSortField = (typeof MOVEMENT_SORT_FIELDS)[number];

export const listInventoryQuerySchema = listQuerySchema(INVENTORY_SORT_FIELDS).extend({
  categoryId: uuidSchema.optional(),
  status: queryEnumList(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  stockState: queryEnumList(['IN_STOCK', 'LOW', 'OUT']),
});

export const listMovementsQuerySchema = listQuerySchema(MOVEMENT_SORT_FIELDS).extend({
  productId: uuidSchema.optional(),
  type: queryEnumList([
    'OPENING_STOCK',
    'PURCHASE_RECEIPT',
    'SALE',
    'SALE_CANCELLATION',
    'SALE_RETURN',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
  ]),
  performedById: uuidSchema.optional(),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export const createAdjustmentSchema = z
  .object({
    productId: uuidSchema,
    direction: z.enum(['IN', 'OUT']),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
    reason: z.enum(['COUNT_CORRECTION', 'DAMAGED', 'EXPIRED', 'LOST', 'STOLEN', 'FOUND', 'OTHER']),
    notes: optionalText(2000),
  })
  .refine((v) => v.reason !== 'OTHER' || (v.notes !== null && v.notes !== undefined && v.notes.trim().length > 0), {
    message: 'Notes are required when adjustment reason is OTHER',
    path: ['notes'],
  });

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ListMovementsQuery = z.infer<typeof listMovementsQuerySchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
