import { Prisma, type RecordStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { diffChanges, recordAudit, type RequestContext } from '../../common/audit/audit';
import { withTransaction, type Tx } from '../../common/db/transaction';
import { ErrorCode, conflict, notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  CustomerSortField,
  UpdateCustomerInput,
} from './customers.schemas';

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

export interface CustomerSummary {
  orderCount: number;
  totalSales: string;
  totalPaid: string;
  outstandingBalance: string;
}

export interface CustomerDetail extends CustomerRow {
  summary: CustomerSummary;
}


const EDITABLE = ['name', 'phone', 'email', 'address', 'notes'] as const;

export async function listCustomers(query: ListCustomersQuery): Promise<Paginated<CustomerRow>> {
  const args = buildListArgs<CustomerSortField, Prisma.CustomerWhereInput, Prisma.CustomerOrderByWithRelationInput>(
    query,
    {
      searchFields: ['name', 'phone', 'email'],
      sortFields: { name: 'name', createdAt: 'createdAt' },
      defaultSort: [{ field: 'name', direction: 'asc' }],
    },
    [query.status ? { status: { in: query.status } } : undefined],
  );
  return paginate(
    query,
    () => prisma.customer.findMany({ ...args, select: customerSelect }),
    () => prisma.customer.count({ where: args.where }),
  );
}

/**
 * Totals over active orders (CONFIRMED / COMPLETED). Sales are net of returns; outstanding balance is
 * Σ max(balance_due, 0) with balance_due = total − returned − (paid − refunded) (BR-PAY-08, BUSINESS_RULES §9–10).
 */
async function customerSummary(id: string): Promise<CustomerSummary> {
  const [row] = await prisma.$queryRaw<
    { order_count: bigint; total_sales: Prisma.Decimal; total_paid: Prisma.Decimal; outstanding: Prisma.Decimal }[]
  >`
    SELECT COUNT(*) AS order_count,
           COALESCE(SUM(total_amount - returned_amount), 0) AS total_sales,
           COALESCE(SUM(paid_amount - refunded_amount), 0) AS total_paid,
           COALESCE(SUM(GREATEST(total_amount - returned_amount - (paid_amount - refunded_amount), 0)), 0) AS outstanding
    FROM orders
    WHERE customer_id = ${id}::uuid
      AND status IN ('CONFIRMED', 'COMPLETED')`;
  return {
    orderCount: Number(row!.order_count),
    totalSales: new Prisma.Decimal(row!.total_sales).toFixed(2),
    totalPaid: new Prisma.Decimal(row!.total_paid).toFixed(2),
    outstandingBalance: new Prisma.Decimal(row!.outstanding).toFixed(2),
  };
}

export async function getCustomer(id: string): Promise<CustomerDetail> {
  const row = await prisma.customer.findUnique({ where: { id }, select: customerSelect });
  if (!row) throw notFound('Customer');
  return { ...row, summary: await customerSummary(id) };
}

/** Locks the customer row; order inserts referencing it (FK KEY SHARE) wait for us. */
async function lockCustomer(tx: Tx, id: string): Promise<CustomerRow> {
  await tx.$queryRaw`SELECT id FROM customers WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await tx.customer.findUnique({ where: { id }, select: customerSelect });
  if (!row) throw notFound('Customer');
  return row;
}

export function createCustomer(input: CreateCustomerInput, ctx: RequestContext): Promise<CustomerRow> {
  return withTransaction(async (tx) => {
    const row = await tx.customer.create({
      data: {
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
      },
      select: customerSelect,
    });
    await recordAudit(tx, ctx, {
      action: 'customer.created',
      entityType: 'customer',
      entityId: row.id,
      metadata: { name: row.name },
    });
    return row;
  });
}

export function updateCustomer(id: string, input: UpdateCustomerInput, ctx: RequestContext): Promise<CustomerRow> {
  return withTransaction(async (tx) => {
    const before = await lockCustomer(tx, id);
    const row = await tx.customer.update({ where: { id }, data: input, select: customerSelect });
    const changes = diffChanges(
      Object.fromEntries(EDITABLE.map((k) => [k, before[k]])),
      Object.fromEntries(EDITABLE.map((k) => [k, input[k]])),
    );
    if (Object.keys(changes).length) {
      await recordAudit(tx, ctx, {
        action: 'customer.updated',
        entityType: 'customer',
        entityId: id,
        metadata: { changes } as Prisma.InputJsonValue,
      });
    }
    return row;
  });
}

/** Archived customers keep their history but cannot be used on new orders (FR-CUST-02). Idempotent. */
export function setCustomerStatus(id: string, status: RecordStatus, ctx: RequestContext): Promise<CustomerRow> {
  return withTransaction(async (tx) => {
    const before = await lockCustomer(tx, id);
    if (before.status === status) return before;
    const row = await tx.customer.update({ where: { id }, data: { status }, select: customerSelect });
    await recordAudit(tx, ctx, {
      action: status === 'ARCHIVED' ? 'customer.archived' : 'customer.unarchived',
      entityType: 'customer',
      entityId: id,
    });
    return row;
  });
}

/** Hard delete only while no order references the customer; otherwise archive (FR-CUST-02). */
export async function deleteCustomer(id: string, ctx: RequestContext): Promise<void> {
  await withTransaction(async (tx) => {
    const row = await lockCustomer(tx, id);
    const orders = await tx.order.count({ where: { customerId: id } });
    if (orders > 0) {
      throw conflict(`Customer has ${orders} order(s); archive it instead`, ErrorCode.REFERENCED);
    }
    await tx.customer.delete({ where: { id } });
    await recordAudit(tx, ctx, {
      action: 'customer.deleted',
      entityType: 'customer',
      entityId: id,
      metadata: { name: row.name },
    });
  });
}
