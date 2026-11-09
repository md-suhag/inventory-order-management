import { z } from 'zod';
import { passwordSchema } from '../../common/auth/password';
import { listQuerySchema, queryBoolean } from '../../common/query/list-query';
import { emailSchema, nameSchema, phoneSchema, uuidSchema } from '../../common/validation/schemas';

export const USER_SORT_FIELDS = ['name', 'email', 'createdAt', 'lastLoginAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];

export const listUsersQuerySchema = listQuerySchema(USER_SORT_FIELDS).extend({
  roleId: uuidSchema.optional(),
  isActive: queryBoolean,
});

export const createUserSchema = z.object({
  name: nameSchema(100),
  email: emailSchema,
  phone: phoneSchema.optional(),
  roleId: uuidSchema,
  password: passwordSchema,
});

export const updateUserSchema = z
  .object({
    name: nameSchema(100).optional(),
    phone: phoneSchema.nullable().optional(),
    roleId: uuidSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.roleId !== undefined, {
    message: 'Provide at least one field to update',
  });

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
