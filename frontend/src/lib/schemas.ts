import { z } from 'zod';

export const passwordRuleSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 bytes')
  .refine((v) => /[A-Za-z]/.test(v), 'Must include at least one letter')
  .refine((v) => /\d/.test(v), 'Must include at least one digit');

export const loginFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Password is required').max(200),
});

export const registerFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9+()\-\s]{5,30}$/.test(v), 'Invalid phone number')
    .optional(),
  password: passwordRuleSchema,
});

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address')),
});

export const resetPasswordFormSchema = z.object({
  token: z.string().min(20, 'Invalid reset token').max(200),
  newPassword: passwordRuleSchema,
});

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(200),
    newPassword: passwordRuleSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from the current password',
  });

export const updateProfileFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[0-9+()\-\s]{5,30}$/.test(v), 'Invalid phone number'),
});
