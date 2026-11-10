import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Package,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import type { DashboardSummary, FinancialSummaryReport, SalesSummaryReport } from '@/lib/api-types';
import { apiFetch } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { formatDate, formatMoney } from '@/lib/format';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { DashboardDateFilter } from '@/components/dashboard/dashboard-date-filter';
import { SalesOverviewChart } from '@/components/dashboard/sales-overview-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; groupBy?: string }>;
}) {
  const { user, settings } = await requireSession();
  const fmt = settings.settings;

  if (!can(user, 'dashboard.read')) {
    return (
      <>
        <PageHeader title="Dashboard" description="Welcome to Inventory & Order Management." />
        <AccessDenied
          title="Dashboard Not Permitted"
          description="Your role does not include dashboard.read. Use the sidebar to open modules assigned to your role."
        />
      </>
    );
  }

  const sp = await searchParams;
  const groupBy = sp.groupBy === 'week' || sp.groupBy === 'month' ? sp.groupBy : 'day';
  const query = { from: sp.from, to: sp.to };

  const canSalesReport = can(user, 'reports.sales');
  const canFinancialReport = can(user, 'reports.financial');

  const [summary, salesReport, financialReport] = await Promise.all([
    apiFetch<DashboardSummary>('/dashboard/summary', { query }),
    canSalesReport
      ? apiFetch<SalesSummaryReport>('/reports/sales/summary', {
          query: { from: sp.from, to: sp.to, groupBy },
        })
      : Promise.resolve(null),
    canFinancialReport
      ? apiFetch<FinancialSummaryReport>('/reports/financial/summary', { query })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Operational Dashboard"
        description={`Period: ${summary.range.from} to ${summary.range.to} (${summary.range.timezone})`}
        actions={
          <DashboardDateFilter
            from={summary.range.from}
            to={summary.range.to}
            groupBy={groupBy}
            showGroupBy={canSalesReport}
          />
        }
      />

      {/* Operational KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Products</CardTitle>
            <Package className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.counts.activeProducts}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.stock.lowStock} low · {summary.stock.outOfStock} out of stock
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle>
            <ShoppingCart className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.orders.pending}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.orders.drafts} drafts awaiting confirmation
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Customers</CardTitle>
            <Users className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.counts.activeCustomers}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.orders.createdInRange.COMPLETED} completed orders in range
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Suppliers</CardTitle>
            <Truck className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.counts.activeSuppliers}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {summary.orders.createdInRange.CONFIRMED} confirmed orders in range
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial KPI cards (gated by dashboard.financials) */}
      {summary.financials ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Value</CardTitle>
              <CircleDollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatMoney(summary.financials.inventoryValue, fmt)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Weighted-average cost</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Receivables Due</CardTitle>
              <CircleDollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatMoney(summary.financials.outstandingCustomerBalance, fmt)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Outstanding customer balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Payables Due</CardTitle>
              <ShoppingBag className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {formatMoney(summary.financials.outstandingSupplierBalance, fmt)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Outstanding supplier balance</p>
            </CardContent>
          </Card>

          {salesReport ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Net Sales</CardTitle>
                <CircleDollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatMoney(salesReport.totals.netSales, fmt)}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {salesReport.totals.orderCount} orders in period
                </p>
              </CardContent>
            </Card>
          ) : null}

          {financialReport ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Est. Gross Profit
                </CardTitle>
                <CircleDollarSign className="size-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {formatMoney(financialReport.costs.estimatedGrossProfit, fmt)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Margin {financialReport.costs.grossMarginPercentage}% (est. gross)
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Sales Chart & Low Stock Alerts */}
      <div className="grid gap-6 lg:grid-cols-7">
        {salesReport ? (
          <Card className="lg:col-span-4">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sales Overview</CardTitle>
                <CardDescription>
                  Net sales across {summary.range.from} to {summary.range.to}
                </CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/reports">
                  Reports <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <SalesOverviewChart data={salesReport.byPeriod} formatSettings={fmt} />
            </CardContent>
          </Card>
        ) : null}

        <Card className={salesReport ? 'lg:col-span-3' : 'lg:col-span-7'}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600" />
                Low &amp; Out-of-Stock Alerts
              </CardTitle>
              <CardDescription>Products at or below reorder threshold</CardDescription>
            </div>
            {can(user, 'inventory.read') ? (
              <Button asChild variant="ghost" size="sm">
                <Link href="/inventory?stockState=LOW,OUT">View all</Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="p-0">
            {summary.stock.items.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">All active products are stocked.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Threshold</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.stock.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/products/${item.id}`} className="font-medium hover:underline">
                          {item.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.stockQuantity}</TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {item.lowStockThreshold}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.stockState} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders & Recent Purchases */}
      <div className="grid gap-6 lg:grid-cols-2">
        {summary.recentOrders ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Orders</CardTitle>
                <CardDescription>Latest customer sales orders</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/orders">
                  All orders <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {summary.recentOrders.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No orders yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.recentOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link href={`/orders/${order.id}`} className="font-mono text-xs font-medium hover:underline">
                            {order.orderNumber}
                          </Link>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDate(order.createdAt, fmt)}
                          </div>
                        </TableCell>
                        <TableCell>{order.customer?.name ?? order.customerName ?? 'Walk-in'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={order.status} />
                            <StatusBadge status={order.paymentStatus} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(order.totalAmount, fmt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}

        {summary.recentPurchases ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Recent Purchases</CardTitle>
                <CardDescription>Latest supplier purchase orders</CardDescription>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/purchases">
                  All purchases <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {summary.recentPurchases.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No purchases yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.recentPurchases.map((purchase) => (
                      <TableRow key={purchase.id}>
                        <TableCell>
                          <Link
                            href={`/purchases/${purchase.id}`}
                            className="font-mono text-xs font-medium hover:underline"
                          >
                            {purchase.purchaseNumber}
                          </Link>
                          <div className="text-[11px] text-muted-foreground">
                            {formatDate(purchase.createdAt, fmt)}
                          </div>
                        </TableCell>
                        <TableCell>{purchase.supplier.name}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <StatusBadge status={purchase.status} />
                            <StatusBadge status={purchase.paymentStatus} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(purchase.totalAmount, fmt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
