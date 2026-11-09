import { z } from 'zod';
import { listQuerySchema, queryEnumList } from '../../common/query/list-query';
import { nameSchema, optionalEmail, optionalPhone, optionalText } from '../../common/validation/schemas';

export const CUSTOMER_SORT_FIELDS = ['name', 'createdAt'] as const;
export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export const listCustomersQuerySchema = listQuerySchema(CUSTOMER_SORT_FIELDS).extend({
  status: queryEnumList(['ACTIVE', 'ARCHIVED']),
});

const customerFields = {
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(2000),
  notes: optionalText(5000),
};

export const createCustomerSchema = z.object({ name: nameSchema(150), ...customerFields });

export const updateCustomerSchema = z
  .object({ name: nameSchema(150).optional(), ...customerFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
