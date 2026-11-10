import { z } from 'zod';
import { decimalString, optionalText } from '../../common/validation/schemas';

export const updateSettingsSchema = z.object({
  businessName: z.string().trim().min(1, 'Business name cannot be empty').max(150).optional(),
  legalName: optionalText(150),
  taxRegistrationNumber: optionalText(50),
  email: z.string().trim().email('Invalid email address').max(254).optional().nullable(),
  phone: optionalText(30),
  address: optionalText(2000),
  logoPath: optionalText(255),
  currencyCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency code must be a 3-letter ISO code')
    .optional(),
  locale: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(64).optional(),
  taxEnabled: z.boolean().optional(),
  taxLabel: z.string().trim().min(1).max(30).optional(),
  defaultTaxRate: decimalString(7, 4).optional(),
  invoiceFooter: optionalText(2000),
  defaultLowStockThreshold: z.number().int().min(0, 'Threshold must be non-negative').optional(),
  lowStockAlertsEnabled: z.boolean().optional(),
  allowSelfRegistration: z.boolean().optional(),
});

export const updateSequenceSchema = z.object({
  prefix: z.string().trim().min(1, 'Prefix cannot be empty').max(10, 'Prefix cannot exceed 10 characters').optional(),
  padding: z.number().int().min(1, 'Padding must be between 1 and 12').max(12, 'Padding must be between 1 and 12').optional(),
});

export const updatePaymentMethodSchema = z.object({
  name: z.string().trim().min(1, 'Name cannot be empty').max(50).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const documentTypeParamSchema = z.object({
  documentType: z.enum(['ORDER', 'INVOICE', 'PURCHASE', 'PURCHASE_RECEIPT', 'PAYMENT', 'SALES_RETURN']),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type UpdateSequenceInput = z.infer<typeof updateSequenceSchema>;
export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodSchema>;
export type DocumentTypeParam = z.infer<typeof documentTypeParamSchema>;
