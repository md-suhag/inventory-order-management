'use client';

import type {
  FinancialAgingReport,
  FinancialSummaryReport,
  InventorySummaryReport,
  InventoryValuationReport,
  PurchasesReport,
  SalesByCustomerReport,
  SalesByProductReport,
  SalesSummaryReport,
} from '@/lib/api-types';
import { formatCost, formatDate, formatMoney, type FormatSettings } from '@/lib/format';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { StatusBadge } from '@/components/shared/status-badge';
import { SalesOverviewChart } from '@/components/dashboard/sales-overview-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function SalesReportView({
  summary,
  byProduct,
  byCustomer,
  canViewCost,
  formatSettings,
}: {
  summary: SalesSummaryReport;
  byProduct: SalesByProductReport;
  byCustomer: SalesByCustomerReport;
  canViewCost: boolean;
  formatSettings: FormatSettings;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Gross Sales</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(summary.totals.grossSales, formatSettings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Discounts</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(summary.totals.discounts, formatSettings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Returns</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(summary.totals.returns, formatSettings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Sales</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-emerald-700">
            {formatMoney(summary.totals.netSales, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Tax Collected</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(summary.totals.taxCollected, formatSettings)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Periodic Sales Trend</CardTitle>
              <CardDescription>
                {summary.range.from} to {summary.range.to}
              </CardDescription>
            </div>
            <CsvExportButton
              filename={`sales-by-period-${summary.range.from}`}
              rows={summary.byPeriod}
              columns={[
                { header: 'Period', value: (r) => r.period },
                { header: 'Orders', value: (r) => r.orderCount },
                { header: 'Gross Sales', value: (r) => r.grossSales },
                { header: 'Discounts', value: (r) => r.discounts },
                { header: 'Returns', value: (r) => r.returns },
                { header: 'Net Sales', value: (r) => r.netSales },
                { header: 'Tax', value: (r) => r.tax },
              ]}
            />
          </CardHeader>
          <CardContent>
            <SalesOverviewChart data={summary.byPeriod} formatSettings={formatSettings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Orders by Status</CardTitle>
            <CardDescription>Created in selected date range</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(summary.ordersByStatus).map(([status, info]) => (
                  <TableRow key={status}>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell className="text-right font-mono">{info.count}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(info.totalAmount, formatSettings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sales by Product */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sales by Product</CardTitle>
            <CardDescription>Sold vs returned quantities and net sales per SKU.</CardDescription>
          </div>
          <CsvExportButton
            filename={`sales-by-product-${byProduct.range.from}`}
            rows={byProduct.data}
            columns={[
              { header: 'SKU', value: (r) => r.sku },
              { header: 'Product', value: (r) => r.productName },
              { header: 'Category', value: (r) => r.categoryName ?? '' },
              { header: 'Qty Sold', value: (r) => r.quantitySold },
              { header: 'Qty Returned', value: (r) => r.quantityReturned },
              { header: 'Gross Sales', value: (r) => r.grossSales },
              { header: 'Discounts', value: (r) => r.discounts },
              { header: 'Returns', value: (r) => r.returns },
              { header: 'Net Sales', value: (r) => r.netSales },
              ...(canViewCost
                ? [
                    { header: 'COGS', value: (r: SalesByProductReport['data'][number]) => r.cogs ?? '' },
                    {
                      header: 'Est. Gross Profit',
                      value: (r: SalesByProductReport['data'][number]) => r.grossProfit ?? '',
                    },
                    {
                      header: 'Margin %',
                      value: (r: SalesByProductReport['data'][number]) => r.marginPercentage ?? '',
                    },
                  ]
                : []),
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Net Sales</TableHead>
                {canViewCost ? <TableHead className="text-right">COGS</TableHead> : null}
                {canViewCost ? <TableHead className="text-right">Est. Gross Profit</TableHead> : null}
                {canViewCost ? <TableHead className="text-right">Margin %</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {byProduct.data.map((row) => (
                <TableRow key={row.productId}>
                  <TableCell>
                    <div className="font-medium">{row.productName}</div>
                    <div className="font-mono text-xs text-muted-foreground">{row.sku}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{row.quantitySold}</TableCell>
                  <TableCell className="text-right font-mono">{row.quantityReturned}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(row.netSales, formatSettings)}</TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right font-mono">{formatMoney(row.cogs, formatSettings)}</TableCell>
                  ) : null}
                  {canViewCost ? (
                    <TableCell className="text-right font-medium">
                      {formatMoney(row.grossProfit, formatSettings)}
                    </TableCell>
                  ) : null}
                  {canViewCost ? (
                    <TableCell className="text-right font-mono">{row.marginPercentage ?? '0.00'}%</TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardContent className="pt-0">
          <DataTablePagination meta={byProduct.meta} />
        </CardContent>
      </Card>

      {/* Sales by Customer */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Sales by Customer</CardTitle>
            <CardDescription>Net sales, paid amounts, and outstanding receivables per customer.</CardDescription>
          </div>
          <CsvExportButton
            filename={`sales-by-customer-${byCustomer.range.from}`}
            rows={byCustomer.data}
            columns={[
              { header: 'Customer', value: (r) => r.customerName },
              { header: 'Orders', value: (r) => r.orderCount },
              { header: 'Net Sales', value: (r) => r.netSales },
              { header: 'Total Paid', value: (r) => r.totalPaid },
              { header: 'Outstanding Balance', value: (r) => r.outstandingBalance },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Net Sales</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byCustomer.data.map((c) => (
                <TableRow key={c.customerId}>
                  <TableCell>
                    <div className="font-medium">{c.customerName}</div>
                    <div className="text-xs text-muted-foreground">{c.phone ?? c.email ?? ''}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.orderCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(c.netSales, formatSettings)}</TableCell>
                  <TableCell className="text-right">{formatMoney(c.totalPaid, formatSettings)}</TableCell>
                  <TableCell className="text-right font-medium text-amber-700">
                    {formatMoney(c.outstandingBalance, formatSettings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function PurchasesReportView({
  report,
  formatSettings,
}: {
  report: PurchasesReport;
  formatSettings: FormatSettings;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Purchase Count</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{report.summary.purchaseCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Ordered Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(report.summary.orderedAmount, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Received Value</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(report.summary.receivedValue, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Paid Amount</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(report.summary.paidAmount, formatSettings)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Purchases by Supplier</CardTitle>
            <CardDescription>Ordered, received, paid, and open payables by vendor.</CardDescription>
          </div>
          <CsvExportButton
            filename={`purchases-by-supplier-${report.range.from}`}
            rows={report.bySupplier}
            columns={[
              { header: 'Supplier', value: (r) => r.supplierName },
              { header: 'Purchases', value: (r) => r.purchaseCount },
              { header: 'Ordered Amount', value: (r) => r.orderedAmount },
              { header: 'Received Value', value: (r) => r.receivedValue },
              { header: 'Paid Amount', value: (r) => r.paidAmount },
              { header: 'Outstanding Balance', value: (r) => r.outstandingBalance },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.bySupplier.map((s) => (
                <TableRow key={s.supplierId}>
                  <TableCell className="font-medium">{s.supplierName}</TableCell>
                  <TableCell className="text-right font-mono">{s.purchaseCount}</TableCell>
                  <TableCell className="text-right">{formatMoney(s.orderedAmount, formatSettings)}</TableCell>
                  <TableCell className="text-right">{formatMoney(s.receivedValue, formatSettings)}</TableCell>
                  <TableCell className="text-right">{formatMoney(s.paidAmount, formatSettings)}</TableCell>
                  <TableCell className="text-right font-medium text-amber-700">
                    {formatMoney(s.outstandingBalance, formatSettings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Purchase History</CardTitle>
          </div>
          <CsvExportButton
            filename={`purchases-list-${report.range.from}`}
            rows={report.purchases.data}
            columns={[
              { header: 'Purchase #', value: (r) => r.purchaseNumber },
              { header: 'Supplier', value: (r) => r.supplierName },
              { header: 'Status', value: (r) => r.status },
              { header: 'Payment Status', value: (r) => r.paymentStatus },
              { header: 'Total', value: (r) => r.totalAmount },
              { header: 'Paid', value: (r) => r.paidAmount },
              { header: 'Created', value: (r) => r.createdAt },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.purchases.data.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.purchaseNumber}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(p.totalAmount, formatSettings)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(p.createdAt, formatSettings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardContent className="pt-0">
          <DataTablePagination meta={report.purchases.meta} />
        </CardContent>
      </Card>
    </div>
  );
}

export function InventoryReportView({
  summary,
  valuation,
  formatSettings,
}: {
  summary: InventorySummaryReport;
  valuation: InventoryValuationReport | null;
  formatSettings: FormatSettings;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Catalog SKUs</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{summary.statusCounts.totalProducts}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">In Stock</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-emerald-700">{summary.statusCounts.inStock}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Low Stock</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-amber-700">{summary.statusCounts.lowStock}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Out of Stock</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-red-700">{summary.statusCounts.outOfStock}</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Movements Summary by Type</CardTitle>
            <CsvExportButton
              filename={`movements-summary-${summary.range.from}`}
              rows={summary.movementsSummary}
              columns={[
                { header: 'Movement Type', value: (r) => r.type },
                { header: 'Count', value: (r) => r.movementCount },
                { header: 'Net Quantity Change', value: (r) => r.totalQuantityChange },
              ]}
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Movement Type</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Net Qty Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.movementsSummary.map((m) => (
                  <TableRow key={m.type}>
                    <TableCell className="font-mono text-xs">{m.type}</TableCell>
                    <TableCell className="text-right font-mono">{m.movementCount}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {m.totalQuantityChange > 0 ? `+${m.totalQuantityChange}` : m.totalQuantityChange}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Low &amp; Out-of-Stock Items</CardTitle>
            <CsvExportButton
              filename={`low-stock-${summary.range.to}`}
              rows={summary.lowStockItems}
              columns={[
                { header: 'SKU', value: (r) => r.sku },
                { header: 'Name', value: (r) => r.name },
                { header: 'Stock', value: (r) => r.stockQuantity },
                { header: 'Threshold', value: (r) => r.threshold },
                { header: 'State', value: (r) => r.stockState },
              ]}
            />
          </CardHeader>
          <CardContent className="p-0">
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
                {summary.lowStockItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.stockQuantity}</TableCell>
                    <TableCell className="text-right font-mono">{item.threshold}</TableCell>
                    <TableCell>
                      <StatusBadge status={item.stockState} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {valuation ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>
                WAC Inventory Valuation — {formatMoney(valuation.totalValuation, formatSettings)}
              </CardTitle>
              <CardDescription>
                {valuation.totalItems} SKUs · {valuation.totalQuantity} total units in stock
              </CardDescription>
            </div>
            <CsvExportButton
              filename="inventory-valuation"
              rows={valuation.items.data}
              columns={[
                { header: 'SKU', value: (r) => r.sku },
                { header: 'Product', value: (r) => r.name },
                { header: 'Category', value: (r) => r.categoryName ?? 'Uncategorized' },
                { header: 'Stock Quantity', value: (r) => r.stockQuantity },
                { header: 'Unit Cost (WAC)', value: (r) => r.costPrice },
                { header: 'Total Valuation', value: (r) => r.valuation },
              ]}
            />
          </CardHeader>
          <CardContent className="space-y-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">SKUs</TableHead>
                  <TableHead className="text-right">Total Qty</TableHead>
                  <TableHead className="text-right">Valuation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuation.byCategory.map((c) => (
                  <TableRow key={c.categoryId ?? 'uncat'}>
                    <TableCell className="font-medium">{c.categoryName}</TableCell>
                    <TableCell className="text-right font-mono">{c.productCount}</TableCell>
                    <TableCell className="text-right font-mono">{c.totalQuantity}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(c.totalValuation, formatSettings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">WAC Cost</TableHead>
                  <TableHead className="text-right">Valuation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valuation.items.data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{p.categoryName ?? 'Uncategorized'}</TableCell>
                    <TableCell className="text-right font-mono">{p.stockQuantity}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {formatCost(p.costPrice, formatSettings)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatMoney(p.valuation, formatSettings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <DataTablePagination meta={valuation.items.meta} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function FinancialReportView({
  summary,
  aging,
  formatSettings,
}: {
  summary: FinancialSummaryReport;
  aging: FinancialAgingReport;
  formatSettings: FormatSettings;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Sales Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatMoney(summary.revenue.netSales, formatSettings)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Tax collected: {formatMoney(summary.revenue.taxCollected, formatSettings)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Estimated Gross Profit
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-700">
              {formatMoney(summary.costs.estimatedGrossProfit, formatSettings)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Margin: {summary.costs.grossMarginPercentage}% (COGS {formatMoney(summary.costs.cogs, formatSettings)})
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Cash Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatMoney(summary.cashFlow.netCashFlow, formatSettings)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              In {formatMoney(summary.cashFlow.moneyIn, formatSettings)} · Out{' '}
              {formatMoney(summary.cashFlow.moneyOut, formatSettings)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Open Balances</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs">
            <p>
              AR (Customer):{' '}
              <span className="font-semibold">
                {formatMoney(summary.balances.outstandingCustomerBalance, formatSettings)}
              </span>
            </p>
            <p>
              AP (Supplier):{' '}
              <span className="font-semibold">
                {formatMoney(summary.balances.outstandingSupplierBalance, formatSettings)}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cash flow by method */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Cash Flow by Payment Method</CardTitle>
            <CardDescription>Excludes reversed payments.</CardDescription>
          </div>
          <CsvExportButton
            filename={`cashflow-${summary.range.from}`}
            rows={summary.cashFlow.byMethod}
            columns={[
              { header: 'Method', value: (r) => r.name },
              { header: 'Code', value: (r) => r.code },
              { header: 'Money In', value: (r) => r.moneyIn },
              { header: 'Money Out', value: (r) => r.moneyOut },
              { header: 'Net Flow', value: (r) => r.netFlow },
            ]}
          />
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Method</TableHead>
                <TableHead className="text-right">Money In</TableHead>
                <TableHead className="text-right">Money Out</TableHead>
                <TableHead className="text-right">Net Flow</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.cashFlow.byMethod.map((m) => (
                <TableRow key={m.methodId}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-right text-emerald-700">
                    {formatMoney(m.moneyIn, formatSettings)}
                  </TableCell>
                  <TableCell className="text-right text-red-700">
                    {formatMoney(m.moneyOut, formatSettings)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatMoney(m.netFlow, formatSettings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AR & AP Aging */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Receivables Aging (As of {aging.asOf})</CardTitle>
              <CardDescription>
                Total AR: {formatMoney(aging.customers.summary.total, formatSettings)}
              </CardDescription>
            </div>
            <CsvExportButton
              filename={`ar-aging-${aging.asOf}`}
              rows={aging.customers.details}
              columns={[
                { header: 'Customer', value: (r) => r.customerName },
                { header: '0-30 Days', value: (r) => r.current },
                { header: '31-60 Days', value: (r) => r.days31To60 },
                { header: '61-90 Days', value: (r) => r.days61To90 },
                { header: '90+ Days', value: (r) => r.over90 },
                { header: 'Total', value: (r) => r.total },
              ]}
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.customers.details.map((row, idx) => (
                  <TableRow key={row.customerId ?? `walkin-${idx}`}>
                    <TableCell className="font-medium">{row.customerName}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.current, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.days31To60, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.days61To90, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.over90, formatSettings)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(row.total, formatSettings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Payables Aging (As of {aging.asOf})</CardTitle>
              <CardDescription>
                Total AP: {formatMoney(aging.suppliers.summary.total, formatSettings)}
              </CardDescription>
            </div>
            <CsvExportButton
              filename={`ap-aging-${aging.asOf}`}
              rows={aging.suppliers.details}
              columns={[
                { header: 'Supplier', value: (r) => r.supplierName },
                { header: '0-30 Days', value: (r) => r.current },
                { header: '31-60 Days', value: (r) => r.days31To60 },
                { header: '61-90 Days', value: (r) => r.days61To90 },
                { header: '90+ Days', value: (r) => r.over90 },
                { header: 'Total', value: (r) => r.total },
              ]}
            />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">0–30</TableHead>
                  <TableHead className="text-right">31–60</TableHead>
                  <TableHead className="text-right">61–90</TableHead>
                  <TableHead className="text-right">90+</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aging.suppliers.details.map((row) => (
                  <TableRow key={row.supplierId}>
                    <TableCell className="font-medium">{row.supplierName}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.current, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.days31To60, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.days61To90, formatSettings)}</TableCell>
                    <TableCell className="text-right">{formatMoney(row.over90, formatSettings)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatMoney(row.total, formatSettings)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
