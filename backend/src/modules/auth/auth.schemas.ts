import { z } from 'zod';
import { passwordSchema } from '../../common/auth/password';
import { emailSchema, nameSchema, phoneSchema } from '../../common/validation/schemas';

const opaqueToken = z.string().min(20).max(200);

export const loginSchema = z.object({
  email: emailSchema,
  // No strength rules at login (they may change); bounded to avoid hashing huge inputs.
  password: z.string().min(1, 'Required').max(200),
});

export const refreshSchema = z.object({ refreshToken: opaqueToken });
export const logoutSchema = z.object({ refreshToken: opaqueToken });

export const registerSchema = z.object({
  name: nameSchema(100),
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: opaqueToken,
  newPassword: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required').max(200),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  });

export const updateProfileSchema = z
  .object({
    name: nameSchema(100).optional(),
    phone: phoneSchema.nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined, { message: 'Provide at least one field to update' });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
