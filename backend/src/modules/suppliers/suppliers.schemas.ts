import { z } from 'zod';
import { listQuerySchema, queryEnumList } from '../../common/query/list-query';
import { nameSchema, optionalEmail, optionalPhone, optionalText } from '../../common/validation/schemas';

export const SUPPLIER_SORT_FIELDS = ['name', 'createdAt'] as const;
export type SupplierSortField = (typeof SUPPLIER_SORT_FIELDS)[number];

export const listSuppliersQuerySchema = listQuerySchema(SUPPLIER_SORT_FIELDS).extend({
  status: queryEnumList(['ACTIVE', 'ARCHIVED']),
});

const supplierFields = {
  contactPerson: optionalText(100),
  phone: optionalPhone,
  email: optionalEmail,
  address: optionalText(2000),
  notes: optionalText(5000),
};

export const createSupplierSchema = z.object({ name: nameSchema(150), ...supplierFields });

export const updateSupplierSchema = z
  .object({ name: nameSchema(150).optional(), ...supplierFields })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' });

export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
