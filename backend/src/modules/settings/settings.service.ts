import { Prisma, type DocumentType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction } from '../../common/db/transaction';
import { businessRule, notFound } from '../../common/errors/app-error';
import { publicUserSelect } from '../users/users.presenter';
import type {
  UpdatePaymentMethodInput,
  UpdateSequenceInput,
  UpdateSettingsInput,
} from './settings.schemas';

export interface BusinessSettingsDetail {
  id: number;
  businessName: string;
  legalName: string | null;
  taxRegistrationNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
  currencyCode: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRate: string;
  invoiceFooter: string | null;
  defaultLowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  allowSelfRegistration: boolean;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: unknown;
}

export interface DocumentSequenceDetail {
  documentType: DocumentType;
  prefix: string;
  nextNumber: number;
  padding: number;
  updatedAt: Date;
}

export interface PaymentMethodDetail {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FullSettingsResponse {
  settings: BusinessSettingsDetail;
  documentSequences: DocumentSequenceDetail[];
  paymentMethods: PaymentMethodDetail[];
}

function mapSettings(s: {
  id: number;
  businessName: string;
  legalName: string | null;
  taxRegistrationNumber: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoPath: string | null;
  currencyCode: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRate: Prisma.Decimal;
  invoiceFooter: string | null;
  defaultLowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  allowSelfRegistration: boolean;
  createdAt: Date;
  updatedAt: Date;
  updatedBy: unknown;
}): BusinessSettingsDetail {
  return {
    id: s.id,
    businessName: s.businessName,
    legalName: s.legalName,
    taxRegistrationNumber: s.taxRegistrationNumber,
    email: s.email,
    phone: s.phone,
    address: s.address,
    logoPath: s.logoPath,
    currencyCode: s.currencyCode,
    locale: s.locale,
    timezone: s.timezone,
    taxEnabled: s.taxEnabled,
    taxLabel: s.taxLabel,
    defaultTaxRate: new Prisma.Decimal(s.defaultTaxRate).toFixed(4),
    invoiceFooter: s.invoiceFooter,
    defaultLowStockThreshold: s.defaultLowStockThreshold,
    lowStockAlertsEnabled: s.lowStockAlertsEnabled,
    allowSelfRegistration: s.allowSelfRegistration,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    updatedBy: s.updatedBy,
  };
}

export async function getSettings(): Promise<FullSettingsResponse> {
  const settings = await prisma.businessSetting.findUniqueOrThrow({
    where: { id: 1 },
    include: { updatedBy: { select: publicUserSelect } },
  });

  const documentSequences = await prisma.documentSequence.findMany({
    orderBy: { documentType: 'asc' },
  });

  const paymentMethods = await prisma.paymentMethod.findMany({
    orderBy: { sortOrder: 'asc' },
  });

  return {
    settings: mapSettings(settings),
    documentSequences,
    paymentMethods,
  };
}

export async function updateSettings(
  input: UpdateSettingsInput,
  ctx: RequestContext,
): Promise<BusinessSettingsDetail> {
  return withTransaction(async (tx) => {
    const current = await tx.businessSetting.findUniqueOrThrow({
      where: { id: 1 },
      include: { updatedBy: { select: publicUserSelect } },
    });

    // FR-SET-02: Currency can only be changed while no confirmed orders, purchases or payments exist
    if (input.currencyCode && input.currencyCode !== current.currencyCode) {
      const [transactionsExist] = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT
          (SELECT COUNT(*) FROM orders WHERE confirmed_at IS NOT NULL) +
          (SELECT COUNT(*) FROM purchases WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')) +
          (SELECT COUNT(*) FROM payments) AS count`;

      if (transactionsExist && Number(transactionsExist.count) > 0) {
        throw businessRule(
          'Currency code cannot be changed once transactions (orders, purchases, or payments) exist',
          [
            {
              field: 'currencyCode',
              message: 'Existing transaction records prevent changing the business currency',
            },
          ],
        );
      }
    }

    const updated = await tx.businessSetting.update({
      where: { id: 1 },
      data: {
        businessName: input.businessName,
        legalName: input.legalName,
        taxRegistrationNumber: input.taxRegistrationNumber,
        email: input.email,
        phone: input.phone,
        address: input.address,
        logoPath: input.logoPath,
        currencyCode: input.currencyCode,
        locale: input.locale,
        timezone: input.timezone,
        taxEnabled: input.taxEnabled,
        taxLabel: input.taxLabel,
        defaultTaxRate:
          input.defaultTaxRate !== undefined ? new Prisma.Decimal(input.defaultTaxRate) : undefined,
        invoiceFooter: input.invoiceFooter,
        defaultLowStockThreshold: input.defaultLowStockThreshold,
        lowStockAlertsEnabled: input.lowStockAlertsEnabled,
        allowSelfRegistration: input.allowSelfRegistration,
        updatedById: ctx.actorId,
      },
      include: { updatedBy: { select: publicUserSelect } },
    });

    const diff = diffChanges(current as unknown as Record<string, unknown>, input);
    await recordAudit(tx, ctx, {
      action: 'settings.updated',
      entityType: 'business_setting',
      entityId: '1',
      metadata: { diff: diff as unknown as Prisma.InputJsonValue },
    });

    return mapSettings(updated);
  });
}

export async function updateSequence(
  documentType: DocumentType,
  input: UpdateSequenceInput,
  ctx: RequestContext,
): Promise<DocumentSequenceDetail> {
  return withTransaction(async (tx) => {
    const existing = await tx.documentSequence.findUnique({
      where: { documentType },
    });
    if (!existing) throw notFound('Document sequence');

    const updated = await tx.documentSequence.update({
      where: { documentType },
      data: {
        prefix: input.prefix,
        padding: input.padding,
      },
    });

    const diff = diffChanges(existing as unknown as Record<string, unknown>, input);
    await recordAudit(tx, ctx, {
      action: 'settings.sequence_updated',
      entityType: 'document_sequence',
      entityId: documentType,
      metadata: { documentType, diff: diff as unknown as Prisma.InputJsonValue },
    });

    return updated;
  });
}

export async function updatePaymentMethod(
  id: string,
  input: UpdatePaymentMethodInput,
  ctx: RequestContext,
): Promise<PaymentMethodDetail> {
  return withTransaction(async (tx) => {
    const existing = await tx.paymentMethod.findUnique({
      where: { id },
    });
    if (!existing) throw notFound('Payment method');

    const updated = await tx.paymentMethod.update({
      where: { id },
      data: {
        name: input.name,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });

    const diff = diffChanges(existing as unknown as Record<string, unknown>, input);
    await recordAudit(tx, ctx, {
      action: 'settings.payment_method_updated',
      entityType: 'payment_method',
      entityId: id,
      metadata: { code: existing.code, diff: diff as unknown as Prisma.InputJsonValue },
    });

    return updated;
  });
}
