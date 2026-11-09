import { z } from 'zod';
import { listQuerySchema, queryEnumList } from '../../common/query/list-query';
import { nameSchema, optionalText } from '../../common/validation/schemas';

export const CATEGORY_SORT_FIELDS = ['name', 'createdAt', 'productCount'] as const;
export type CategorySortField = (typeof CATEGORY_SORT_FIELDS)[number];

export const listCategoriesQuerySchema = listQuerySchema(CATEGORY_SORT_FIELDS).extend({
  status: queryEnumList(['ACTIVE', 'ARCHIVED']),
});

export const createCategorySchema = z.object({
  name: nameSchema(100),
  description: optionalText(2000),
});

export const updateCategorySchema = z
  .object({
    name: nameSchema(100).optional(),
    description: optionalText(2000),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'Provide at least one field to update',
  });

export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
