import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type {
  DateRangeQuery,
  FinancialAgingQuery,
  FinancialSummaryQuery,
  InventorySummaryQuery,
  InventoryValuationQuery,
  PurchasesReportQuery,
  SalesByCustomerQuery,
  SalesByProductQuery,
  SalesSummaryQuery,
} from './reports.schemas';

interface Range {
  from: string;
  to: string;
  timezone: string;
  startAt: Date;
  endAt: Date;
}

function formatMoney(value: Prisma.Decimal | number | string | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return new Prisma.Decimal(value).toFixed(2);
}

async function resolveRange(query: DateRangeQuery): Promise<Range> {
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

export async function getSalesSummary(query: SalesSummaryQuery) {
  const range = await resolveRange(query);

  // Active non-cancelled orders confirmed in range
  const [orderTotals] = await prisma.$queryRaw<
    {
      gross_sales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      order_tax: Prisma.Decimal;
      order_count: bigint;
    }[]
  >`
    SELECT
      COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_sales,
      COALESCE(SUM(oi.discount_amount + oi.allocated_discount), 0) AS discounts,
      COALESCE(SUM(oi.tax_amount), 0) AS order_tax,
      COUNT(DISTINCT o.id) AS order_count
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
      AND o.confirmed_at >= ${range.startAt}
      AND o.confirmed_at < ${range.endAt}`;

  // Completed returns processed in range
  const [returnTotals] = await prisma.$queryRaw<
    {
      returns_subtotal: Prisma.Decimal;
      returns_tax: Prisma.Decimal;
      return_count: bigint;
    }[]
  >`
    SELECT
      COALESCE(SUM(subtotal), 0) AS returns_subtotal,
      COALESCE(SUM(tax_amount), 0) AS returns_tax,
      COUNT(id) AS return_count
    FROM sales_returns
    WHERE status = 'COMPLETED'
      AND processed_at >= ${range.startAt}
      AND processed_at < ${range.endAt}`;

  const grossSales = new Prisma.Decimal(orderTotals?.gross_sales ?? 0);
  const discounts = new Prisma.Decimal(orderTotals?.discounts ?? 0);
  const returns = new Prisma.Decimal(returnTotals?.returns_subtotal ?? 0);
  const netSales = grossSales.sub(discounts).sub(returns);
  const taxCollected = new Prisma.Decimal(orderTotals?.order_tax ?? 0).sub(
    new Prisma.Decimal(returnTotals?.returns_tax ?? 0),
  );

  // Periodic breakdown
  const dateFormat =
    query.groupBy === 'month' ? 'YYYY-MM' : query.groupBy === 'week' ? 'IYYY-IW' : 'YYYY-MM-DD';

  const orderPeriods = await prisma.$queryRaw<
    {
      period: string;
      gross_sales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      tax_amount: Prisma.Decimal;
      order_count: bigint;
    }[]
  >`
    SELECT
      to_char(o.confirmed_at AT TIME ZONE ${range.timezone}, ${dateFormat}) AS period,
      COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_sales,
      COALESCE(SUM(oi.discount_amount + oi.allocated_discount), 0) AS discounts,
      COALESCE(SUM(oi.tax_amount), 0) AS tax_amount,
      COUNT(DISTINCT o.id) AS order_count
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
      AND o.confirmed_at >= ${range.startAt}
      AND o.confirmed_at < ${range.endAt}
    GROUP BY 1
    ORDER BY 1 ASC`;

  const returnPeriods = await prisma.$queryRaw<
    {
      period: string;
      returns_subtotal: Prisma.Decimal;
      returns_tax: Prisma.Decimal;
    }[]
  >`
    SELECT
      to_char(processed_at AT TIME ZONE ${range.timezone}, ${dateFormat}) AS period,
      COALESCE(SUM(subtotal), 0) AS returns_subtotal,
      COALESCE(SUM(tax_amount), 0) AS returns_tax
    FROM sales_returns
    WHERE status = 'COMPLETED'
      AND processed_at >= ${range.startAt}
      AND processed_at < ${range.endAt}
    GROUP BY 1
    ORDER BY 1 ASC`;

  const periodMap = new Map<
    string,
    {
      grossSales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      returns: Prisma.Decimal;
      tax: Prisma.Decimal;
      orderCount: number;
    }
  >();

  for (const op of orderPeriods) {
    periodMap.set(op.period, {
      grossSales: new Prisma.Decimal(op.gross_sales),
      discounts: new Prisma.Decimal(op.discounts),
      returns: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(op.tax_amount),
      orderCount: Number(op.order_count),
    });
  }

  for (const rp of returnPeriods) {
    const entry = periodMap.get(rp.period) ?? {
      grossSales: new Prisma.Decimal(0),
      discounts: new Prisma.Decimal(0),
      returns: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(0),
      orderCount: 0,
    };
    entry.returns = entry.returns.add(rp.returns_subtotal);
    entry.tax = entry.tax.sub(rp.returns_tax);
    periodMap.set(rp.period, entry);
  }

  const allPeriods = [...periodMap.keys()].sort();
  const byPeriod = allPeriods.map((period) => {
    const data = periodMap.get(period)!;
    const pNet = data.grossSales.sub(data.discounts).sub(data.returns);
    return {
      period,
      grossSales: formatMoney(data.grossSales),
      discounts: formatMoney(data.discounts),
      returns: formatMoney(data.returns),
      netSales: formatMoney(pNet),
      tax: formatMoney(data.tax),
      orderCount: data.orderCount,
    };
  });

  // Orders created in range by status (FR-REP-04)
  const statusRows = await prisma.$queryRaw<
    { status: string; count: bigint; total_amount: Prisma.Decimal }[]
  >`
    SELECT
      status,
      COUNT(id) AS count,
      COALESCE(SUM(total_amount), 0) AS total_amount
    FROM orders
    WHERE created_at >= ${range.startAt} AND created_at < ${range.endAt}
    GROUP BY status`;

  const ordersByStatus: Record<string, { count: number; totalAmount: string }> = {
    DRAFT: { count: 0, totalAmount: '0.00' },
    CONFIRMED: { count: 0, totalAmount: '0.00' },
    SHIPPED: { count: 0, totalAmount: '0.00' },
    DELIVERED: { count: 0, totalAmount: '0.00' },
    COMPLETED: { count: 0, totalAmount: '0.00' },
    CANCELLED: { count: 0, totalAmount: '0.00' },
  };

  for (const s of statusRows) {
    ordersByStatus[s.status] = {
      count: Number(s.count),
      totalAmount: formatMoney(s.total_amount),
    };
  }

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    totals: {
      grossSales: formatMoney(grossSales),
      discounts: formatMoney(discounts),
      returns: formatMoney(returns),
      netSales: formatMoney(netSales),
      taxCollected: formatMoney(taxCollected),
      orderCount: Number(orderTotals?.order_count ?? 0),
      completedReturnsCount: Number(returnTotals?.return_count ?? 0),
    },
    byPeriod,
    ordersByStatus,
  };
}

export async function getSalesByProduct(
  query: SalesByProductQuery,
  options: { canViewCost?: boolean },
) {
  const range = await resolveRange(query);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const whereConditions: Prisma.Sql[] = [
    Prisma.sql`p.status <> 'ARCHIVED'`,
  ];
  if (query.categoryId) {
    whereConditions.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
  }
  if (query.search) {
    const searchPattern = `%${query.search}%`;
    whereConditions.push(
      Prisma.sql`(p.name ILIKE ${searchPattern} OR p.sku ILIKE ${searchPattern})`,
    );
  }
  const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

  const [countRow] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM products p ${whereSql}`;
  const total = Number(countRow?.total ?? 0);

  const rows = await prisma.$queryRaw<
    {
      product_id: string;
      product_name: string;
      sku: string;
      category_name: string | null;
      qty_sold: bigint;
      gross_sales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      cogs_sold: Prisma.Decimal;
      qty_returned: bigint;
      returns_subtotal: Prisma.Decimal;
      resalable_cogs_returned: Prisma.Decimal;
    }[]
  >`
    WITH sold AS (
      SELECT
        oi.product_id,
        COALESCE(SUM(oi.quantity), 0) AS qty_sold,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_sales,
        COALESCE(SUM(oi.discount_amount + oi.allocated_discount), 0) AS discounts,
        COALESCE(SUM(oi.quantity * COALESCE(oi.unit_cost, 0)), 0) AS cogs_sold
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
        AND o.confirmed_at >= ${range.startAt}
        AND o.confirmed_at < ${range.endAt}
      GROUP BY oi.product_id
    ),
    ret AS (
      SELECT
        oi.product_id,
        COALESCE(SUM(sri.quantity), 0) AS qty_returned,
        COALESCE(SUM(sri.subtotal), 0) AS returns_subtotal,
        COALESCE(SUM(CASE WHEN sri.condition = 'RESALABLE' THEN sri.quantity * COALESCE(oi.unit_cost, 0) ELSE 0 END), 0) AS resalable_cogs_returned
      FROM sales_return_items sri
      JOIN sales_returns sr ON sr.id = sri.sales_return_id
      JOIN order_items oi ON oi.id = sri.order_item_id
      WHERE sr.status = 'COMPLETED'
        AND sr.processed_at >= ${range.startAt}
        AND sr.processed_at < ${range.endAt}
      GROUP BY oi.product_id
    )
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      c.name AS category_name,
      COALESCE(s.qty_sold, 0) AS qty_sold,
      COALESCE(s.gross_sales, 0) AS gross_sales,
      COALESCE(s.discounts, 0) AS discounts,
      COALESCE(s.cogs_sold, 0) AS cogs_sold,
      COALESCE(r.qty_returned, 0) AS qty_returned,
      COALESCE(r.returns_subtotal, 0) AS returns_subtotal,
      COALESCE(r.resalable_cogs_returned, 0) AS resalable_cogs_returned
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN sold s ON s.product_id = p.id
    LEFT JOIN ret r ON r.product_id = p.id
    ${whereSql}
    ORDER BY (COALESCE(s.gross_sales, 0) - COALESCE(s.discounts, 0) - COALESCE(r.returns_subtotal, 0)) DESC, p.name ASC
    LIMIT ${pageSize} OFFSET ${offset}`;

  const data = rows.map((r) => {
    const gross = new Prisma.Decimal(r.gross_sales);
    const disc = new Prisma.Decimal(r.discounts);
    const ret = new Prisma.Decimal(r.returns_subtotal);
    const netSales = gross.sub(disc).sub(ret);

    let costInfo:
      | { cogs: string; grossProfit: string; marginPercentage: string }
      | undefined = undefined;

    if (options.canViewCost) {
      const cogsSold = new Prisma.Decimal(r.cogs_sold);
      const resalableCogsReturned = new Prisma.Decimal(r.resalable_cogs_returned);
      const cogs = cogsSold.sub(resalableCogsReturned);
      const grossProfit = netSales.sub(cogs);
      const margin =
        netSales.isPositive() && !netSales.isZero()
          ? grossProfit.div(netSales).mul(100).toFixed(2)
          : '0.00';
      costInfo = {
        cogs: formatMoney(cogs),
        grossProfit: formatMoney(grossProfit),
        marginPercentage: margin,
      };
    }

    return {
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      categoryName: r.category_name,
      quantitySold: Number(r.qty_sold),
      quantityReturned: Number(r.qty_returned),
      grossSales: formatMoney(gross),
      discounts: formatMoney(disc),
      returns: formatMoney(ret),
      netSales: formatMoney(netSales),
      ...costInfo,
    };
  });

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

export async function getSalesByCustomer(query: SalesByCustomerQuery) {
  const range = await resolveRange(query);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const whereConditions: Prisma.Sql[] = [
    Prisma.sql`c.status <> 'ARCHIVED'`,
  ];
  if (query.search) {
    const searchPattern = `%${query.search}%`;
    whereConditions.push(
      Prisma.sql`(c.name ILIKE ${searchPattern} OR c.email ILIKE ${searchPattern} OR c.phone ILIKE ${searchPattern})`,
    );
  }
  const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

  const [countRow] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM customers c ${whereSql}`;
  const total = Number(countRow?.total ?? 0);

  const rows = await prisma.$queryRaw<
    {
      customer_id: string;
      customer_name: string;
      phone: string | null;
      email: string | null;
      order_count: bigint;
      gross_sales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      returns: Prisma.Decimal;
      total_paid: Prisma.Decimal;
      outstanding_balance: Prisma.Decimal;
    }[]
  >`
    WITH customer_orders AS (
      SELECT
        o.customer_id,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_sales,
        COALESCE(SUM(oi.discount_amount + oi.allocated_discount), 0) AS discounts
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.customer_id IS NOT NULL
        AND o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
        AND o.confirmed_at >= ${range.startAt}
        AND o.confirmed_at < ${range.endAt}
      GROUP BY o.customer_id
    ),
    customer_returns AS (
      SELECT
        o.customer_id,
        COALESCE(SUM(sr.subtotal), 0) AS returns
      FROM sales_returns sr
      JOIN orders o ON o.id = sr.order_id
      WHERE o.customer_id IS NOT NULL
        AND sr.status = 'COMPLETED'
        AND sr.processed_at >= ${range.startAt}
        AND sr.processed_at < ${range.endAt}
      GROUP BY o.customer_id
    ),
    customer_payments AS (
      SELECT
        o.customer_id,
        COALESCE(SUM(p.amount), 0) AS total_paid
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      LEFT JOIN payments rev ON rev.reversed_payment_id = p.id
      WHERE o.customer_id IS NOT NULL
        AND p.type = 'PAYMENT'
        AND rev.id IS NULL
        AND p.paid_at >= ${range.startAt}
        AND p.paid_at < ${range.endAt}
      GROUP BY o.customer_id
    ),
    customer_balances AS (
      SELECT
        o.customer_id,
        COALESCE(SUM(GREATEST(o.total_amount - o.returned_amount - (o.paid_amount - o.refunded_amount), 0)), 0) AS outstanding_balance
      FROM orders o
      WHERE o.customer_id IS NOT NULL
        AND o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
      GROUP BY o.customer_id
    )
    SELECT
      c.id AS customer_id,
      c.name AS customer_name,
      c.phone,
      c.email,
      COALESCE(co.order_count, 0) AS order_count,
      COALESCE(co.gross_sales, 0) AS gross_sales,
      COALESCE(co.discounts, 0) AS discounts,
      COALESCE(cr.returns, 0) AS returns,
      COALESCE(cp.total_paid, 0) AS total_paid,
      COALESCE(cb.outstanding_balance, 0) AS outstanding_balance
    FROM customers c
    LEFT JOIN customer_orders co ON co.customer_id = c.id
    LEFT JOIN customer_returns cr ON cr.customer_id = c.id
    LEFT JOIN customer_payments cp ON cp.customer_id = c.id
    LEFT JOIN customer_balances cb ON cb.customer_id = c.id
    ${whereSql}
    ORDER BY (COALESCE(co.gross_sales, 0) - COALESCE(co.discounts, 0) - COALESCE(cr.returns, 0)) DESC, c.name ASC
    LIMIT ${pageSize} OFFSET ${offset}`;

  const data = rows.map((r) => {
    const gross = new Prisma.Decimal(r.gross_sales);
    const discounts = new Prisma.Decimal(r.discounts);
    const returns = new Prisma.Decimal(r.returns);
    const netSales = gross.sub(discounts).sub(returns);

    return {
      customerId: r.customer_id,
      customerName: r.customer_name,
      phone: r.phone,
      email: r.email,
      orderCount: Number(r.order_count),
      grossSales: formatMoney(gross),
      discounts: formatMoney(discounts),
      returns: formatMoney(returns),
      netSales: formatMoney(netSales),
      totalPaid: formatMoney(r.total_paid),
      outstandingBalance: formatMoney(r.outstanding_balance),
    };
  });

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    data,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

export async function getPurchasesReport(query: PurchasesReportQuery) {
  const range = await resolveRange(query);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  // 1. Overall totals in range
  const [orderedTotal] = await prisma.$queryRaw<{ ordered_amount: Prisma.Decimal; purchase_count: bigint }[]>`
    SELECT
      COALESCE(SUM(total_amount), 0) AS ordered_amount,
      COUNT(id) AS purchase_count
    FROM purchases
    WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')
      AND (ordered_at >= ${range.startAt} AND ordered_at < ${range.endAt})`;

  const [receivedTotal] = await prisma.$queryRaw<{ received_value: Prisma.Decimal }[]>`
    SELECT
      COALESCE(SUM(pri.quantity * pri.unit_cost), 0) AS received_value
    FROM purchase_receipt_items pri
    JOIN purchase_receipts pr ON pr.id = pri.receipt_id
    WHERE pr.received_at >= ${range.startAt} AND pr.received_at < ${range.endAt}`;

  const [paidTotal] = await prisma.$queryRaw<{ paid_amount: Prisma.Decimal }[]>`
    SELECT
      COALESCE(SUM(p.amount), 0) - COALESCE(
        (SELECT SUM(rev.amount) FROM payments rev
         JOIN payments orig ON orig.id = rev.reversed_payment_id
         WHERE orig.purchase_id IS NOT NULL AND orig.type = 'PAYMENT'
           AND rev.paid_at >= ${range.startAt} AND rev.paid_at < ${range.endAt}), 0
      ) AS paid_amount
    FROM payments p
    WHERE p.purchase_id IS NOT NULL
      AND p.type = 'PAYMENT'
      AND p.paid_at >= ${range.startAt}
      AND p.paid_at < ${range.endAt}`;

  // 2. Breakdown by supplier
  const supplierRows = await prisma.$queryRaw<
    {
      supplier_id: string;
      supplier_name: string;
      purchase_count: bigint;
      ordered_amount: Prisma.Decimal;
      received_value: Prisma.Decimal;
      paid_amount: Prisma.Decimal;
      outstanding_balance: Prisma.Decimal;
    }[]
  >`
    WITH sup_ordered AS (
      SELECT
        supplier_id,
        COUNT(id) AS purchase_count,
        COALESCE(SUM(total_amount), 0) AS ordered_amount
      FROM purchases
      WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')
        AND (ordered_at >= ${range.startAt} AND ordered_at < ${range.endAt})
      GROUP BY supplier_id
    ),
    sup_received AS (
      SELECT
        p.supplier_id,
        COALESCE(SUM(pri.quantity * pri.unit_cost), 0) AS received_value
      FROM purchase_receipt_items pri
      JOIN purchase_receipts pr ON pr.id = pri.receipt_id
      JOIN purchases p ON p.id = pr.purchase_id
      WHERE pr.received_at >= ${range.startAt} AND pr.received_at < ${range.endAt}
      GROUP BY p.supplier_id
    ),
    sup_paid AS (
      SELECT
        p.supplier_id,
        COALESCE(SUM(pm.amount), 0) AS paid_amount
      FROM payments pm
      JOIN purchases p ON p.id = pm.purchase_id
      LEFT JOIN payments rev ON rev.reversed_payment_id = pm.id
      WHERE pm.type = 'PAYMENT'
        AND rev.id IS NULL
        AND pm.paid_at >= ${range.startAt}
        AND pm.paid_at < ${range.endAt}
      GROUP BY p.supplier_id
    ),
    sup_balance AS (
      SELECT
        supplier_id,
        COALESCE(SUM(GREATEST(total_amount - (paid_amount - refunded_amount), 0)), 0) AS outstanding_balance
      FROM purchases
      WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')
      GROUP BY supplier_id
    )
    SELECT
      s.id AS supplier_id,
      s.name AS supplier_name,
      COALESCE(so.purchase_count, 0) AS purchase_count,
      COALESCE(so.ordered_amount, 0) AS ordered_amount,
      COALESCE(sr.received_value, 0) AS received_value,
      COALESCE(sp.paid_amount, 0) AS paid_amount,
      COALESCE(sb.outstanding_balance, 0) AS outstanding_balance
    FROM suppliers s
    LEFT JOIN sup_ordered so ON so.supplier_id = s.id
    LEFT JOIN sup_received sr ON sr.supplier_id = s.id
    LEFT JOIN sup_paid sp ON sp.supplier_id = s.id
    LEFT JOIN sup_balance sb ON sb.supplier_id = s.id
    WHERE s.status <> 'ARCHIVED'
      AND (so.purchase_count > 0 OR sr.received_value > 0 OR sp.paid_amount > 0 OR sb.outstanding_balance > 0)
    ORDER BY COALESCE(so.ordered_amount, 0) DESC, s.name ASC`;

  // 3. Paginated purchases list
  const whereConditions: Prisma.Sql[] = [
    Prisma.sql`p.status <> 'CANCELLED'`,
    Prisma.sql`((p.ordered_at >= ${range.startAt} AND p.ordered_at < ${range.endAt}) OR (p.created_at >= ${range.startAt} AND p.created_at < ${range.endAt}))`,
  ];
  if (query.supplierId) {
    whereConditions.push(Prisma.sql`p.supplier_id = ${query.supplierId}::uuid`);
  }
  if (query.search) {
    const searchPattern = `%${query.search}%`;
    whereConditions.push(
      Prisma.sql`(p.purchase_number ILIKE ${searchPattern} OR s.name ILIKE ${searchPattern})`,
    );
  }
  const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

  const [countPurchases] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM purchases p JOIN suppliers s ON s.id = p.supplier_id ${whereSql}`;
  const total = Number(countPurchases?.total ?? 0);

  const purchaseRows = await prisma.$queryRaw<
    {
      id: string;
      purchase_number: string;
      supplier_name: string;
      status: string;
      payment_status: string;
      total_amount: Prisma.Decimal;
      paid_amount: Prisma.Decimal;
      ordered_at: Date | null;
      created_at: Date;
    }[]
  >`
    SELECT
      p.id,
      p.purchase_number,
      s.name AS supplier_name,
      p.status,
      p.payment_status,
      p.total_amount,
      p.paid_amount,
      p.ordered_at,
      p.created_at
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    ${whereSql}
    ORDER BY p.created_at DESC
    LIMIT ${pageSize} OFFSET ${offset}`;

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    summary: {
      orderedAmount: formatMoney(orderedTotal?.ordered_amount ?? 0),
      receivedValue: formatMoney(receivedTotal?.received_value ?? 0),
      paidAmount: formatMoney(paidTotal?.paid_amount ?? 0),
      purchaseCount: Number(orderedTotal?.purchase_count ?? 0),
    },
    bySupplier: supplierRows.map((s) => ({
      supplierId: s.supplier_id,
      supplierName: s.supplier_name,
      purchaseCount: Number(s.purchase_count),
      orderedAmount: formatMoney(s.ordered_amount),
      receivedValue: formatMoney(s.received_value),
      paidAmount: formatMoney(s.paid_amount),
      outstandingBalance: formatMoney(s.outstanding_balance),
    })),
    purchases: {
      data: purchaseRows.map((p) => ({
        id: p.id,
        purchaseNumber: p.purchase_number,
        supplierName: p.supplier_name,
        status: p.status,
        paymentStatus: p.payment_status,
        totalAmount: formatMoney(p.total_amount),
        paidAmount: formatMoney(p.paid_amount),
        orderedAt: p.ordered_at,
        createdAt: p.created_at,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    },
  };
}

export async function getInventorySummary(query: InventorySummaryQuery) {
  const range = await resolveRange(query);

  const [stockCounts] = await prisma.$queryRaw<
    {
      total_products: bigint;
      in_stock: bigint;
      low_stock: bigint;
      out_of_stock: bigint;
    }[]
  >`
    WITH s AS (
      SELECT COALESCE((SELECT default_low_stock_threshold FROM business_settings WHERE id = 1), 10) AS threshold
    )
    SELECT
      COUNT(p.id) AS total_products,
      COUNT(p.id) FILTER (WHERE p.stock_quantity > COALESCE(p.reorder_level, s.threshold)) AS in_stock,
      COUNT(p.id) FILTER (WHERE p.stock_quantity > 0 AND p.stock_quantity <= COALESCE(p.reorder_level, s.threshold)) AS low_stock,
      COUNT(p.id) FILTER (WHERE p.stock_quantity = 0) AS out_of_stock
    FROM products p, s
    WHERE p.status <> 'ARCHIVED'`;

  // Movement totals per type in range (FR-REP-07)
  const movementRows = await prisma.$queryRaw<
    {
      type: string;
      movement_count: bigint;
      total_quantity: bigint;
    }[]
  >`
    SELECT
      type,
      COUNT(id) AS movement_count,
      COALESCE(SUM(quantity_change), 0) AS total_quantity
    FROM inventory_movements
    WHERE created_at >= ${range.startAt} AND created_at < ${range.endAt}
    GROUP BY type
    ORDER BY type ASC`;

  // Low stock items top 20
  const lowStockRows = await prisma.$queryRaw<
    {
      id: string;
      sku: string;
      name: string;
      stock_quantity: number;
      threshold: number;
    }[]
  >`
    SELECT p.id, p.sku, p.name, p.stock_quantity,
           COALESCE(p.reorder_level, s.default_low_stock_threshold) AS threshold
    FROM products p
    CROSS JOIN (SELECT COALESCE((SELECT default_low_stock_threshold FROM business_settings WHERE id = 1), 10)
                  AS default_low_stock_threshold) s
    WHERE p.status <> 'ARCHIVED'
      AND p.stock_quantity <= COALESCE(p.reorder_level, s.default_low_stock_threshold)
    ORDER BY p.stock_quantity ASC, p.name ASC
    LIMIT 20`;

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    statusCounts: {
      totalProducts: Number(stockCounts?.total_products ?? 0),
      inStock: Number(stockCounts?.in_stock ?? 0),
      lowStock: Number(stockCounts?.low_stock ?? 0),
      outOfStock: Number(stockCounts?.out_of_stock ?? 0),
    },
    movementsSummary: movementRows.map((m) => ({
      type: m.type,
      movementCount: Number(m.movement_count),
      totalQuantityChange: Number(m.total_quantity),
    })),
    lowStockItems: lowStockRows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      stockQuantity: r.stock_quantity,
      threshold: r.threshold,
      stockState: r.stock_quantity === 0 ? 'OUT' : 'LOW',
    })),
  };
}

export async function getInventoryValuation(query: InventoryValuationQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  const whereConditions: Prisma.Sql[] = [
    Prisma.sql`p.status <> 'ARCHIVED'`,
  ];
  if (query.categoryId) {
    whereConditions.push(Prisma.sql`p.category_id = ${query.categoryId}::uuid`);
  }
  if (query.search) {
    const searchPattern = `%${query.search}%`;
    whereConditions.push(
      Prisma.sql`(p.name ILIKE ${searchPattern} OR p.sku ILIKE ${searchPattern})`,
    );
  }
  const whereSql = Prisma.sql`WHERE ${Prisma.join(whereConditions, ' AND ')}`;

  // Total valuation overall
  const [totalRow] = await prisma.$queryRaw<
    { total_valuation: Prisma.Decimal; total_quantity: bigint; total_items: bigint }[]
  >`
    SELECT
      COALESCE(SUM(p.stock_quantity * p.cost_price), 0) AS total_valuation,
      COALESCE(SUM(p.stock_quantity), 0) AS total_quantity,
      COUNT(p.id) AS total_items
    FROM products p
    ${whereSql}`;

  // By category
  const categoryRows = await prisma.$queryRaw<
    {
      category_id: string | null;
      category_name: string | null;
      product_count: bigint;
      total_quantity: bigint;
      total_valuation: Prisma.Decimal;
    }[]
  >`
    SELECT
      c.id AS category_id,
      COALESCE(c.name, 'Uncategorized') AS category_name,
      COUNT(p.id) AS product_count,
      COALESCE(SUM(p.stock_quantity), 0) AS total_quantity,
      COALESCE(SUM(p.stock_quantity * p.cost_price), 0) AS total_valuation
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${whereSql}
    GROUP BY c.id, c.name
    ORDER BY total_valuation DESC, c.name ASC`;

  // Paginated items
  const [countRow] = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total FROM products p ${whereSql}`;
  const total = Number(countRow?.total ?? 0);

  const productRows = await prisma.$queryRaw<
    {
      id: string;
      sku: string;
      name: string;
      category_name: string | null;
      stock_quantity: number;
      cost_price: Prisma.Decimal;
      valuation: Prisma.Decimal;
    }[]
  >`
    SELECT
      p.id,
      p.sku,
      p.name,
      c.name AS category_name,
      p.stock_quantity,
      p.cost_price,
      (p.stock_quantity * p.cost_price) AS valuation
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${whereSql}
    ORDER BY (p.stock_quantity * p.cost_price) DESC, p.name ASC
    LIMIT ${pageSize} OFFSET ${offset}`;

  return {
    totalValuation: formatMoney(totalRow?.total_valuation ?? 0),
    totalQuantity: Number(totalRow?.total_quantity ?? 0),
    totalItems: Number(totalRow?.total_items ?? 0),
    byCategory: categoryRows.map((c) => ({
      categoryId: c.category_id,
      categoryName: c.category_name,
      productCount: Number(c.product_count),
      totalQuantity: Number(c.total_quantity),
      totalValuation: formatMoney(c.total_valuation),
    })),
    items: {
      data: productRows.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryName: p.category_name,
        stockQuantity: p.stock_quantity,
        costPrice: new Prisma.Decimal(p.cost_price).toFixed(4),
        valuation: formatMoney(p.valuation),
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    },
  };
}

export async function getFinancialSummary(query: FinancialSummaryQuery) {
  const range = await resolveRange(query);

  // Revenue & tax
  const [salesRow] = await prisma.$queryRaw<
    {
      gross_sales: Prisma.Decimal;
      discounts: Prisma.Decimal;
      order_tax: Prisma.Decimal;
      cogs_sold: Prisma.Decimal;
    }[]
  >`
    SELECT
      COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS gross_sales,
      COALESCE(SUM(oi.discount_amount + oi.allocated_discount), 0) AS discounts,
      COALESCE(SUM(oi.tax_amount), 0) AS order_tax,
      COALESCE(SUM(oi.quantity * COALESCE(oi.unit_cost, 0)), 0) AS cogs_sold
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.id
    WHERE o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
      AND o.confirmed_at >= ${range.startAt}
      AND o.confirmed_at < ${range.endAt}`;

  const [returnRow] = await prisma.$queryRaw<
    {
      returns_subtotal: Prisma.Decimal;
      returns_tax: Prisma.Decimal;
      resalable_cogs: Prisma.Decimal;
    }[]
  >`
    SELECT
      COALESCE(SUM(sri.subtotal), 0) AS returns_subtotal,
      COALESCE(SUM(sri.tax_amount), 0) AS returns_tax,
      COALESCE(SUM(CASE WHEN sri.condition = 'RESALABLE' THEN sri.quantity * COALESCE(oi.unit_cost, 0) ELSE 0 END), 0) AS resalable_cogs
    FROM sales_return_items sri
    JOIN sales_returns sr ON sr.id = sri.sales_return_id
    JOIN order_items oi ON oi.id = sri.order_item_id
    WHERE sr.status = 'COMPLETED'
      AND sr.processed_at >= ${range.startAt}
      AND sr.processed_at < ${range.endAt}`;

  const grossSales = new Prisma.Decimal(salesRow?.gross_sales ?? 0);
  const discounts = new Prisma.Decimal(salesRow?.discounts ?? 0);
  const returns = new Prisma.Decimal(returnRow?.returns_subtotal ?? 0);
  const netSales = grossSales.sub(discounts).sub(returns);
  const taxCollected = new Prisma.Decimal(salesRow?.order_tax ?? 0).sub(
    new Prisma.Decimal(returnRow?.returns_tax ?? 0),
  );

  const cogsSold = new Prisma.Decimal(salesRow?.cogs_sold ?? 0);
  const resalableCogs = new Prisma.Decimal(returnRow?.resalable_cogs ?? 0);
  const cogs = cogsSold.sub(resalableCogs);
  const estimatedGrossProfit = netSales.sub(cogs);
  const grossMarginPercentage =
    netSales.isPositive() && !netSales.isZero()
      ? estimatedGrossProfit.div(netSales).mul(100).toFixed(2)
      : '0.00';

  // Purchases received value
  const [purchaseRow] = await prisma.$queryRaw<{ purchase_cost: Prisma.Decimal }[]>`
    SELECT
      COALESCE(SUM(pri.quantity * pri.unit_cost), 0) AS purchase_cost
    FROM purchase_receipt_items pri
    JOIN purchase_receipts pr ON pr.id = pri.receipt_id
    WHERE pr.received_at >= ${range.startAt} AND pr.received_at < ${range.endAt}`;

  // Cash flow (BR §9)
  // in = customer PAYMENT + supplier REFUND
  // out = supplier PAYMENT + customer REFUND
  const [cashFlowRow] = await prisma.$queryRaw<
    {
      money_in: Prisma.Decimal;
      money_out: Prisma.Decimal;
    }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN (p.order_id IS NOT NULL AND p.type = 'PAYMENT') OR (p.purchase_id IS NOT NULL AND p.type = 'REFUND') THEN p.amount ELSE 0 END), 0) AS money_in,
      COALESCE(SUM(CASE WHEN (p.purchase_id IS NOT NULL AND p.type = 'PAYMENT') OR (p.order_id IS NOT NULL AND p.type = 'REFUND') THEN p.amount ELSE 0 END), 0) AS money_out
    FROM payments p
    LEFT JOIN payments rev ON rev.reversed_payment_id = p.id
    WHERE p.type IN ('PAYMENT', 'REFUND')
      AND rev.id IS NULL
      AND p.paid_at >= ${range.startAt}
      AND p.paid_at < ${range.endAt}`;

  const moneyIn = new Prisma.Decimal(cashFlowRow?.money_in ?? 0);
  const moneyOut = new Prisma.Decimal(cashFlowRow?.money_out ?? 0);
  const netCashFlow = moneyIn.sub(moneyOut);

  // Cash flow by method
  const methodRows = await prisma.$queryRaw<
    {
      method_id: string;
      code: string;
      name: string;
      money_in: Prisma.Decimal;
      money_out: Prisma.Decimal;
    }[]
  >`
    SELECT
      pm.id AS method_id,
      pm.code,
      pm.name,
      COALESCE(SUM(CASE WHEN (p.order_id IS NOT NULL AND p.type = 'PAYMENT') OR (p.purchase_id IS NOT NULL AND p.type = 'REFUND') THEN p.amount ELSE 0 END), 0) AS money_in,
      COALESCE(SUM(CASE WHEN (p.purchase_id IS NOT NULL AND p.type = 'PAYMENT') OR (p.order_id IS NOT NULL AND p.type = 'REFUND') THEN p.amount ELSE 0 END), 0) AS money_out
    FROM payment_methods pm
    LEFT JOIN payments p ON p.payment_method_id = pm.id
      AND p.type IN ('PAYMENT', 'REFUND')
      AND p.paid_at >= ${range.startAt}
      AND p.paid_at < ${range.endAt}
      AND NOT EXISTS (SELECT 1 FROM payments rev WHERE rev.reversed_payment_id = p.id)
    GROUP BY pm.id, pm.code, pm.name, pm.sort_order
    ORDER BY pm.sort_order ASC`;

  // Outstanding balances
  const [balanceRow] = await prisma.$queryRaw<
    {
      customer_balance: Prisma.Decimal;
      supplier_balance: Prisma.Decimal;
    }[]
  >`
    SELECT
      (SELECT COALESCE(SUM(GREATEST(total_amount - returned_amount - (paid_amount - refunded_amount), 0)), 0)
       FROM orders WHERE status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')) AS customer_balance,
      (SELECT COALESCE(SUM(GREATEST(total_amount - (paid_amount - refunded_amount), 0)), 0)
       FROM purchases WHERE status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')) AS supplier_balance`;

  return {
    range: { from: range.from, to: range.to, timezone: range.timezone },
    revenue: {
      grossSales: formatMoney(grossSales),
      discounts: formatMoney(discounts),
      returns: formatMoney(returns),
      netSales: formatMoney(netSales),
      taxCollected: formatMoney(taxCollected),
    },
    costs: {
      cogs: formatMoney(cogs),
      estimatedGrossProfit: formatMoney(estimatedGrossProfit),
      grossMarginPercentage,
      purchaseCost: formatMoney(purchaseRow?.purchase_cost ?? 0),
    },
    cashFlow: {
      moneyIn: formatMoney(moneyIn),
      moneyOut: formatMoney(moneyOut),
      netCashFlow: formatMoney(netCashFlow),
      byMethod: methodRows.map((m) => {
        const i = new Prisma.Decimal(m.money_in);
        const o = new Prisma.Decimal(m.money_out);
        return {
          methodId: m.method_id,
          code: m.code,
          name: m.name,
          moneyIn: formatMoney(i),
          moneyOut: formatMoney(o),
          netFlow: formatMoney(i.sub(o)),
        };
      }),
    },
    balances: {
      outstandingCustomerBalance: formatMoney(balanceRow?.customer_balance ?? 0),
      outstandingSupplierBalance: formatMoney(balanceRow?.supplier_balance ?? 0),
    },
  };
}

export async function getFinancialAging(query: FinancialAgingQuery) {
  const asOfDate = query.asOf ? new Date(`${query.asOf}T23:59:59.999Z`) : new Date();

  // Customer aging (orders)
  const customerAgingRows = await prisma.$queryRaw<
    {
      customer_id: string;
      customer_name: string;
      days_0_to_30: Prisma.Decimal;
      days_31_to_60: Prisma.Decimal;
      days_61_to_90: Prisma.Decimal;
      over_90: Prisma.Decimal;
      total: Prisma.Decimal;
    }[]
  >`
    WITH order_balances AS (
      SELECT
        o.customer_id,
        COALESCE(c.name, o.customer_name, 'Unknown') AS customer_name,
        GREATEST(o.total_amount - o.returned_amount - (o.paid_amount - o.refunded_amount), 0) AS balance_due,
        EXTRACT(DAY FROM (${asOfDate} - COALESCE(o.confirmed_at, o.created_at)))::int AS age_days
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.status IN ('CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED')
        AND COALESCE(o.confirmed_at, o.created_at) <= ${asOfDate}
    )
    SELECT
      customer_id,
      customer_name,
      COALESCE(SUM(CASE WHEN age_days <= 30 THEN balance_due ELSE 0 END), 0) AS days_0_to_30,
      COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN balance_due ELSE 0 END), 0) AS days_31_to_60,
      COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN balance_due ELSE 0 END), 0) AS days_61_to_90,
      COALESCE(SUM(CASE WHEN age_days > 90 THEN balance_due ELSE 0 END), 0) AS over_90,
      COALESCE(SUM(balance_due), 0) AS total
    FROM order_balances
    WHERE balance_due > 0
    GROUP BY customer_id, customer_name
    ORDER BY total DESC`;

  // Supplier aging (purchases)
  const supplierAgingRows = await prisma.$queryRaw<
    {
      supplier_id: string;
      supplier_name: string;
      days_0_to_30: Prisma.Decimal;
      days_31_to_60: Prisma.Decimal;
      days_61_to_90: Prisma.Decimal;
      over_90: Prisma.Decimal;
      total: Prisma.Decimal;
    }[]
  >`
    WITH purchase_balances AS (
      SELECT
        p.supplier_id,
        s.name AS supplier_name,
        GREATEST(p.total_amount - (p.paid_amount - p.refunded_amount), 0) AS balance_due,
        EXTRACT(DAY FROM (${asOfDate} - COALESCE(p.ordered_at, p.created_at)))::int AS age_days
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.status IN ('ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED')
        AND COALESCE(p.ordered_at, p.created_at) <= ${asOfDate}
    )
    SELECT
      supplier_id,
      supplier_name,
      COALESCE(SUM(CASE WHEN age_days <= 30 THEN balance_due ELSE 0 END), 0) AS days_0_to_30,
      COALESCE(SUM(CASE WHEN age_days BETWEEN 31 AND 60 THEN balance_due ELSE 0 END), 0) AS days_31_to_60,
      COALESCE(SUM(CASE WHEN age_days BETWEEN 61 AND 90 THEN balance_due ELSE 0 END), 0) AS days_61_to_90,
      COALESCE(SUM(CASE WHEN age_days > 90 THEN balance_due ELSE 0 END), 0) AS over_90,
      COALESCE(SUM(balance_due), 0) AS total
    FROM purchase_balances
    WHERE balance_due > 0
    GROUP BY supplier_id, supplier_name
    ORDER BY total DESC`;

  const sumTotals = (
    rows: {
      days_0_to_30: Prisma.Decimal;
      days_31_to_60: Prisma.Decimal;
      days_61_to_90: Prisma.Decimal;
      over_90: Prisma.Decimal;
      total: Prisma.Decimal;
    }[],
  ) => {
    let d0 = new Prisma.Decimal(0);
    let d31 = new Prisma.Decimal(0);
    let d61 = new Prisma.Decimal(0);
    let o90 = new Prisma.Decimal(0);
    let tot = new Prisma.Decimal(0);

    for (const r of rows) {
      d0 = d0.add(r.days_0_to_30);
      d31 = d31.add(r.days_31_to_60);
      d61 = d61.add(r.days_61_to_90);
      o90 = o90.add(r.over_90);
      tot = tot.add(r.total);
    }

    return {
      current: formatMoney(d0),
      days31To60: formatMoney(d31),
      days61To90: formatMoney(d61),
      over90: formatMoney(o90),
      total: formatMoney(tot),
    };
  };

  return {
    asOf: asOfDate.toISOString().slice(0, 10),
    customers: {
      summary: sumTotals(customerAgingRows),
      details: customerAgingRows.map((r) => ({
        customerId: r.customer_id,
        customerName: r.customer_name,
        current: formatMoney(r.days_0_to_30),
        days31To60: formatMoney(r.days_31_to_60),
        days61To90: formatMoney(r.days_61_to_90),
        over90: formatMoney(r.over_90),
        total: formatMoney(r.total),
      })),
    },
    suppliers: {
      summary: sumTotals(supplierAgingRows),
      details: supplierAgingRows.map((r) => ({
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        current: formatMoney(r.days_0_to_30),
        days31To60: formatMoney(r.days_31_to_60),
        days61To90: formatMoney(r.days_61_to_90),
        over90: formatMoney(r.over_90),
        total: formatMoney(r.total),
      })),
    },
  };
}
