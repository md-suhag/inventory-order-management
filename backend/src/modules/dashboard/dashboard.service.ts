import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { DashboardQuery } from './dashboard.schemas';

/** What the caller may see on the dashboard (FUNCTIONAL_REQUIREMENTS §2, §5). */
export interface DashboardViewer {
  financials: boolean;
  orders: boolean;
  purchases: boolean;
}

const LOW_STOCK_LIST = 10;
const RECENT = 5;

interface Range {
  from: string;
  to: string;
  timezone: string;
  startAt: Date;
  endAt: Date;
}

/**
 * Inclusive [from, to] calendar dates in the business timezone (default: the current month),
 * converted to UTC instants [startAt, endAt).
 */
async function resolveRange(query: DashboardQuery): Promise<Range> {
  const [row] = await prisma.$queryRaw<
    { from: string; to: string; timezone: string; start_at: Date; end_at: Date }[]
  >`
    WITH s AS (SELECT COALESCE((SELECT timezone FROM business_settings WHERE id = 1), 'UTC') AS tz),
    d AS (
      SELECT tz,
             COALESCE(${query.from ?? null}::date, date_trunc('month', now() AT TIME ZONE tz)::date) AS from_d,
             COALESCE(${query.to ?? null}::date,
                      (date_trunc('month', now() AT TIME ZONE tz) + interval '1 month' - interval '1 day')::date) AS to_d
      FROM s
    )
    SELECT to_char(from_d, 'YYYY-MM-DD') AS "from",
           to_char(to_d, 'YYYY-MM-DD') AS "to",
           tz AS timezone,
           (from_d::timestamp AT TIME ZONE tz) AS start_at,
           ((to_d + 1)::timestamp AT TIME ZONE tz) AS end_at
    FROM d`;
  return {
    from: row!.from,
    to: row!.to,
    timezone: row!.timezone,
    startAt: row!.start_at,
    endAt: row!.end_at,
  };
}

/**
 * All dashboard counts in one aggregate round trip (NFR-PERF-05). Stock states follow BR-PROD-04 over
 * non-archived products; orders "in range" are those created in [startAt, endAt).
 */
async function counts(range: Range) {
  const [row] = await prisma.$queryRaw<Record<string, bigint>[]>`
    WITH s AS (SELECT COALESCE((SELECT default_low_stock_threshold FROM business_settings WHERE id = 1), 10) AS threshold)
    SELECT
      (SELECT COUNT(*) FROM products WHERE status = 'ACTIVE') AS active_products,
      (SELECT COUNT(*) FROM customers WHERE status = 'ACTIVE') AS active_customers,
      (SELECT COUNT(*) FROM suppliers WHERE status = 'ACTIVE') AS active_suppliers,
      (SELECT COUNT(*) FROM products p, s
        WHERE p.status <> 'ARCHIVED' AND p.stock_quantity > 0
          AND p.stock_quantity <= COALESCE(p.reorder_level, s.threshold)) AS low_stock,
      (SELECT COUNT(*) FROM products WHERE status <> 'ARCHIVED' AND stock_quantity = 0) AS out_of_stock,
      (SELECT COUNT(*) FROM orders WHERE status = 'CONFIRMED') AS pending_orders,
      (SELECT COUNT(*) FROM orders WHERE status = 'DRAFT') AS draft_orders,
      o.draft, o.confirmed, o.completed, o.cancelled
    FROM (
      SELECT COUNT(*) FILTER (WHERE status = 'DRAFT') AS draft,
             COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS confirmed,
             COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
             COUNT(*) FILTER (WHERE status = 'CANCELLED') AS cancelled
      FROM orders
      WHERE created_at >= ${range.startAt} AND created_at < ${range.endAt}
    ) o`;
  const n = (key: string) => Number(row![key]);
  return {
    counts: {
      activeProducts: n('active_products'),
      activeCustomers: n('active_customers'),
      activeSuppliers: n('active_suppliers'),
    },
    orders: {
      createdInRange: {
        DRAFT: n('draft'),
        CONFIRMED: n('confirmed'),
        COMPLETED: n('completed'),
        CANCELLED: n('cancelled'),
      },
      pending: n('pending_orders'),
      drafts: n('draft_orders'),
    },
    stock: { lowStock: n('low_stock'), outOfStock: n('out_of_stock') },
  };
}

async function lowStockItems() {
  const rows = await prisma.$queryRaw<
    { id: string; sku: string; name: string; stock_quantity: number; threshold: number }[]
  >`
    SELECT p.id, p.sku, p.name, p.stock_quantity,
           COALESCE(p.reorder_level, s.default_low_stock_threshold) AS threshold
    FROM products p
    CROSS JOIN (SELECT COALESCE((SELECT default_low_stock_threshold FROM business_settings WHERE id = 1), 10)
                  AS default_low_stock_threshold) s
    WHERE p.status <> 'ARCHIVED'
      AND p.stock_quantity <= COALESCE(p.reorder_level, s.default_low_stock_threshold)
    ORDER BY p.stock_quantity ASC, p.name ASC
    LIMIT ${LOW_STOCK_LIST}`;
  return rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    stockQuantity: r.stock_quantity,
    lowStockThreshold: r.threshold,
    stockState: r.stock_quantity === 0 ? ('OUT' as const) : ('LOW' as const),
  }));
}

/**
 * Point-in-time financial tiles available before sales/purchase reporting exists (BUSINESS_RULES §9):
 * inventory value and outstanding balances. Net sales, gross profit and purchase value are added
 * with the order and purchase modules.
 */
async function financials() {
  const [row] = await prisma.$queryRaw<
    { inventory_value: Prisma.Decimal; customer_balance: Prisma.Decimal; supplier_balance: Prisma.Decimal }[]
  >`
    SELECT
      (SELECT COALESCE(SUM(stock_quantity * cost_price), 0) FROM products WHERE status <> 'ARCHIVED') AS inventory_value,
      (SELECT COALESCE(SUM(GREATEST(total_amount - returned_amount - (paid_amount - refunded_amount), 0)), 0)
         FROM orders WHERE status IN ('CONFIRMED', 'COMPLETED')) AS customer_balance,
      (SELECT COALESCE(SUM(GREATEST(total_amount - (paid_amount - refunded_amount), 0)), 0)
         FROM purchases WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')) AS supplier_balance`;
  const money = (v: Prisma.Decimal) => new Prisma.Decimal(v).toFixed(2);
  return {
    inventoryValue: money(row!.inventory_value),
    outstandingCustomerBalance: money(row!.customer_balance),
    outstandingSupplierBalance: money(row!.supplier_balance),
  };
}

export async function getSummary(query: DashboardQuery, viewer: DashboardViewer) {
  const range = await resolveRange(query);
  const summary = await counts(range);
  const lowStock = await lowStockItems();

  // Sequential on purpose: small queries, no burst of pool connections per request.
  const recentOrders = viewer.orders
    ? await prisma.order.findMany({
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          customerName: true,
          customer: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT,
      })
    : undefined;
  const recentPurchases = viewer.purchases
    ? await prisma.purchase.findMany({
        select: {
          id: true,
          purchaseNumber: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          supplier: { select: { id: true, name: true } },
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT,
      })
    : undefined;
  const money = viewer.financials ? await financials() : undefined;

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    counts: summary.counts,
    orders: summary.orders,
    stock: { ...summary.stock, items: lowStock },
    ...(recentOrders ? { recentOrders } : {}),
    ...(recentPurchases ? { recentPurchases } : {}),
    ...(money ? { financials: money } : {}),
  };
}
