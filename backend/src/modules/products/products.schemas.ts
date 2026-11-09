import { z } from 'zod';
import { listQuerySchema, queryEnumList } from '../../common/query/list-query';
import { decimalString, nameSchema, optionalText, uuidSchema } from '../../common/validation/schemas';

export const PRODUCT_SORT_FIELDS = ['name', 'sku', 'sellingPrice', 'stockQuantity', 'createdAt'] as const;
export type ProductSortField = (typeof PRODUCT_SORT_FIELDS)[number];

export const STOCK_STATES = ['IN_STOCK', 'LOW', 'OUT'] as const;
export type StockState = (typeof STOCK_STATES)[number];

export const listProductsQuerySchema = listQuerySchema(PRODUCT_SORT_FIELDS).extend({
  status: queryEnumList(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
  stockState: queryEnumList(STOCK_STATES),
  categoryId: uuidSchema.optional(),
});

/** BR-PROD-01: trimmed, upper-cased, no whitespace. */
const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'Required')
  .max(64)
  .regex(/^\S+$/, 'Must not contain spaces');

const barcodeSchema = z
  .string()
  .trim()
  .max(64)
  .regex(/^\S*$/, 'Must not contain spaces')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const taxRateSchema = decimalString(3, 4)
  .refine((v) => Number(v) <= 100, 'Must be between 0 and 100')
  .nullable()
  .optional();

const productFields = {
  barcode: barcodeSchema,
  description: optionalText(5000),
  categoryId: uuidSchema.nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  costPrice: decimalString(10, 4).optional(),
  taxRate: taxRateSchema,
  reorderLevel: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
};

export const createProductSchema = z.object({
  sku: skuSchema,
  name: nameSchema(200),
  sellingPrice: decimalString(12, 2),
  ...productFields,
  /** FR-PROD-02: recorded as an OPENING_STOCK movement at the cost price. */
  openingStock: z.number().int().min(0).max(1_000_000_000).optional(),
});

export const updateProductSchema = z
  .object({
    sku: skuSchema.optional(),
    name: nameSchema(200).optional(),
    sellingPrice: decimalString(12, 2).optional(),
    ...productFields,
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
