import { DocumentType, type PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, SystemRole } from '../../common/auth/permissions';

const ROLE_DESCRIPTIONS: Record<SystemRole, string> = {
  ADMIN: 'Full system access including users, roles, settings and audit logs',
  MANAGER: 'All operational modules and reports; no administration',
  STAFF: 'Sales counter operations: orders, customer payments, returns requests',
};

const DOCUMENT_PREFIXES: Record<DocumentType, string> = {
  ORDER: 'SO',
  INVOICE: 'INV',
  PURCHASE: 'PO',
  PURCHASE_RECEIPT: 'GRN',
  PAYMENT: 'PAY',
  SALES_RETURN: 'RET',
};

const PAYMENT_METHODS = [
  { code: 'CASH', name: 'Cash' },
  { code: 'BANK_TRANSFER', name: 'Bank transfer' },
  { code: 'CARD', name: 'Card' },
  { code: 'MOBILE_WALLET', name: 'Mobile wallet' },
  { code: 'CHEQUE', name: 'Cheque' },
];

/**
 * Reference data required in every environment. Idempotent: safe to run on every deploy.
 * - Permissions are synced with the code catalogue (removed keys are deleted).
 * - System roles get default grants only when first created, so Admin customisations of
 *   MANAGER/STAFF survive re-seeding. ADMIN is always re-synced to every permission.
 * - Settings, sequences and payment methods are created only if missing.
 */
export async function seedBase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      for (const [key, p] of Object.entries(PERMISSIONS)) {
        await tx.permission.upsert({
          where: { key },
          create: { key, module: p.module, description: p.description },
          update: { module: p.module, description: p.description },
        });
      }
      await tx.permission.deleteMany({ where: { key: { notIn: ALL_PERMISSIONS } } });

      for (const name of Object.values(SystemRole)) {
        const existing = await tx.role.findUnique({ where: { name } });
        const role =
          existing ??
          (await tx.role.create({ data: { name, description: ROLE_DESCRIPTIONS[name], isSystem: true } }));
        if (!existing || name === SystemRole.ADMIN) {
          await tx.rolePermission.createMany({
            data: DEFAULT_ROLE_PERMISSIONS[name].map((permissionKey) => ({ roleId: role.id, permissionKey })),
            skipDuplicates: true,
          });
        }
      }

      await tx.businessSetting.upsert({
        where: { id: 1 },
        create: { id: 1, businessName: 'My Business' },
        update: {},
      });

      for (const documentType of Object.values(DocumentType)) {
        await tx.documentSequence.upsert({
          where: { documentType },
          create: { documentType, prefix: DOCUMENT_PREFIXES[documentType] },
          update: {},
        });
      }

      for (const [i, m] of PAYMENT_METHODS.entries()) {
        await tx.paymentMethod.upsert({
          where: { code: m.code },
          create: { ...m, sortOrder: i },
          update: {},
        });
      }
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
