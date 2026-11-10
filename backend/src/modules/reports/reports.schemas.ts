import { z } from 'zod';
import { queryDate } from '../../common/query/list-query';
import { uuidSchema } from '../../common/validation/schemas';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeQuerySchema = z.object({
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export const salesSummaryQuerySchema = dateRangeQuerySchema.extend({
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

export const salesByProductQuerySchema = dateRangeQuerySchema.merge(paginationSchema).extend({
  categoryId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

export const salesByCustomerQuerySchema = dateRangeQuerySchema.merge(paginationSchema).extend({
  search: z.string().trim().max(100).optional(),
});

export const purchasesReportQuerySchema = dateRangeQuerySchema.merge(paginationSchema).extend({
  supplierId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

export const inventorySummaryQuerySchema = dateRangeQuerySchema;

export const inventoryValuationQuerySchema = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  search: z.string().trim().max(100).optional(),
});

export const financialSummaryQuerySchema = dateRangeQuerySchema;

export const financialAgingQuerySchema = z.object({
  asOf: queryDate.transform((v) => v?.slice(0, 10)).optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type SalesByProductQuery = z.infer<typeof salesByProductQuerySchema>;
export type SalesByCustomerQuery = z.infer<typeof salesByCustomerQuerySchema>;
export type PurchasesReportQuery = z.infer<typeof purchasesReportQuerySchema>;
export type InventorySummaryQuery = z.infer<typeof inventorySummaryQuerySchema>;
export type InventoryValuationQuery = z.infer<typeof inventoryValuationQuerySchema>;
export type FinancialSummaryQuery = z.infer<typeof financialSummaryQuerySchema>;
export type FinancialAgingQuery = z.infer<typeof financialAgingQuerySchema>;
