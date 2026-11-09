import { z } from 'zod';

/** Trimmed, lower-cased email (users.email is stored lower-case — DB CHECK). */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email('Invalid email address'));

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[0-9+()\-\s]{5,30}$/, 'Invalid phone number');

export const nameSchema = (max = 100) => z.string().trim().min(1, 'Required').max(max);

export const uuidSchema = z.uuid('Invalid id');
export const idParamsSchema = z.object({ id: uuidSchema });

/** Optional contact fields: "" or null clears the value on update. */
export const optionalPhone = z.union([z.literal('').transform(() => null), phoneSchema]).nullable().optional();
export const optionalEmail = z
  .union([z.literal('').transform(() => null), emailSchema])
  .nullable()
  .optional();

/** Optional free text: trims, converts "" to null (clears the field on update). */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();
