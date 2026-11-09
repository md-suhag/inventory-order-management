import { Prisma, type RecordStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { ErrorCode, conflict, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import type {
  CreateSupplierInput,
  ListSuppliersQuery,
  SupplierSortField,
  UpdateSupplierInput,
} from './suppliers.schemas';

const supplierSelect = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierSelect;

type SupplierRow = Prisma.SupplierGetPayload<{ select: typeof supplierSelect }>;

export interface SupplierSummary {
  purchaseCount: number;
  totalPurchased: string;
  totalPaid: string;
  outstandingBalance: string;
}

export interface SupplierDetail extends SupplierRow {
  summary: SupplierSummary;
}

const EDITABLE = ['name', 'contactPerson', 'phone', 'email', 'address', 'notes'] as const;

export async function listSuppliers(query: ListSuppliersQuery): Promise<Paginated<SupplierRow>> {
  const args = buildListArgs<SupplierSortField, Prisma.SupplierWhereInput, Prisma.SupplierOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'contactPerson', 'phone', 'email'],
      sortFields: { name: 'name', createdAt: 'createdAt' },
      defaultSort: [{ field: 'name', direction: 'asc' }],
    },
    [query.status ? { status: { in: query.status } } : undefined],
  );
  return paginate(
    query,
    () => prisma.supplier.findMany({ ...args, select: supplierSelect }),
    () => prisma.supplier.count({ where: args.where }),
  );
}

/**
 * Totals over active purchases (ORDERED / PARTIALLY_RECEIVED / RECEIVED). Outstanding balance is
 * Σ max(balance_due, 0) with balance_due = total − (paid − refunded) (BR-PAY-08, BUSINESS_RULES §9–10).
 */
async function supplierSummary(id: string): Promise<SupplierSummary> {
  const [row] = await prisma.$queryRaw<
    { purchase_count: bigint; total_purchased: Prisma.Decimal; total_paid: Prisma.Decimal; outstanding: Prisma.Decimal }[]
  >`
    SELECT COUNT(*) AS purchase_count,
           COALESCE(SUM(total_amount), 0) AS total_purchased,
           COALESCE(SUM(paid_amount - refunded_amount), 0) AS total_paid,
           COALESCE(SUM(GREATEST(total_amount - (paid_amount - refunded_amount), 0)), 0) AS outstanding
    FROM purchases
    WHERE supplier_id = ${id}::uuid
      AND status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')`;
  return {
    purchaseCount: Number(row!.purchase_count),
    totalPurchased: new Prisma.Decimal(row!.total_purchased).toFixed(2),
    totalPaid: new Prisma.Decimal(row!.total_paid).toFixed(2),
    outstandingBalance: new Prisma.Decimal(row!.outstanding).toFixed(2),
  };
}

export async function getSupplier(id: string): Promise<SupplierDetail> {
  const row = await prisma.supplier.findUnique({ where: { id }, select: supplierSelect });
  if (!row) throw notFound('Supplier');
  return { ...row, summary: await supplierSummary(id) };
}

/** Locks the supplier row; purchase inserts referencing it (FK KEY SHARE) wait for us. */
async function lockSupplier(tx: Tx, id: string): Promise<SupplierRow> {
  await tx.$queryRaw`SELECT id FROM suppliers WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.supplier.findUnique({ where: { id }, select: supplierSelect });
  if (!row) throw notFound('Supplier');
  return row;
}

export function createSupplier(input: CreateSupplierInput, ctx: RequestContext): Promise<SupplierRow> {
  return withTransaction(async (tx) => {
    const row = await tx.supplier.create({
      data: {
        name: input.name,
        contactPerson: input.contactPerson ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
      select: supplierSelect,
    });
    await recordAudit(tx, ctx, {
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: row.id,
      metadata: { name: row.name },
    });
    return row;
  });
}

export function updateSupplier(id: string, input: UpdateSupplierInput, ctx: RequestContext): Promise<SupplierRow> {
  return withTransaction(async (tx) => {
    const before = await lockSupplier(tx, id);
    const row = await tx.supplier.update({ where: { id }, data: input, select: supplierSelect });
    const changes = diffChanges(
      Object.fromEntries(EDITABLE.map((k) => [k, before[k]])),
      Object.fromEntries(EDITABLE.map((k) => [k, input[k]])),
    );
    if (Object.keys(changes).length) {
      await recordAudit(tx, ctx, {
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: id,
        metadata: { changes } as Prisma.InputJsonValue,
      });
    }
    return row;
  });
}

/** Archived suppliers keep their history but cannot receive new purchases (FR-SUP-02). Idempotent. */
export function setSupplierStatus(id: string, status: RecordStatus, ctx: RequestContext): Promise<SupplierRow> {
  return withTransaction(async (tx) => {
    const before = await lockSupplier(tx, id);
    if (before.status === status) return before;
    const row = await tx.supplier.update({ where: { id }, data: { status }, select: supplierSelect });
    await recordAudit(tx, ctx, {
      action: status === 'ARCHIVED' ? 'supplier.archived' : 'supplier.unarchived',
      entityType: 'supplier',
      entityId: id,
    });
    return row;
  });
}

/** Hard delete only while no purchase references the supplier; otherwise archive (FR-SUP-02). */
export async function deleteSupplier(id: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await lockSupplier(tx, id);
    const purchases = await tx.purchase.count({ where: { supplierId: id } });
    if (purchases > 0) {
      throw conflict(`Supplier has ${purchases} purchase(s); archive it instead`, ErrorCode.REFERENCED);
    }
    await tx.supplier.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: 'supplier.deleted',
      entityType: 'supplier',
      entityId: id,
      metadata: { name: row.name },
    });
  });
}
