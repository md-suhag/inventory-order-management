import { z } from 'zod';
import { isPermission, type Permission } from '../../common/auth/permissions';
import { listQuerySchema } from '../../common/query/list-query';
import { optionalText } from '../../common/validation/schemas';

export const ROLE_SORT_FIELDS = ['name', 'createdAt'] as const;
export type RoleSortField = (typeof ROLE_SORT_FIELDS)[number];

export const listRolesQuerySchema = listQuerySchema(ROLE_SORT_FIELDS);

const roleName = z
  .string()
  .trim()
  .min(2, 'Must be at least 2 characters')
  .max(50)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 _-]*$/, 'Use letters, digits, spaces, "_" or "-"');

/** Deduplicated list of known permission keys. */
const permissionList = z
  .array(z.string())
  .max(200)
  .superRefine((keys, ctx) => {
    keys.forEach((k, i) => {
      if (!isPermission(k)) ctx.addIssue({ code: 'custom', path: [i], message: `Unknown permission "${k}"` });
    });
  })
  .transform((keys) => [...new Set(keys)].sort() as Permission[]);

export const createRoleSchema = z.object({
  name: roleName,
  description: optionalText(255),
  permissions: permissionList.default([]),
});

export const updateRoleSchema = z
  .object({
    name: roleName.optional(),
    description: optionalText(255),
    permissions: permissionList.optional(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined || v.permissions !== undefined, {
    message: 'Provide at least one field to update',
  });

export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
