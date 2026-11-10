import type { Metadata } from 'next';
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
import { apiFetch } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import {
  FinancialReportView,
  InventoryReportView,
  PurchasesReportView,
  SalesReportView,
} from './reports-client';
import { ReportsControls, type ReportTab } from './reports-controls';

export const metadata: Metadata = { title: 'Reports & Analytics' };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    from?: string;
    to?: string;
    groupBy?: string;
    asOf?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  const availableTabs: { id: ReportTab; label: string }[] = [];
  if (can(user, 'reports.sales')) availableTabs.push({ id: 'sales', label: 'Sales' });
  if (can(user, 'reports.purchases')) availableTabs.push({ id: 'purchases', label: 'Purchases' });
  if (can(user, 'reports.inventory')) availableTabs.push({ id: 'inventory', label: 'Inventory & Valuation' });
  if (can(user, 'reports.financial')) availableTabs.push({ id: 'financial', label: 'Financial & Aging' });

  if (availableTabs.length === 0) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const activeTab: ReportTab = availableTabs.some((t) => t.id === sp.tab)
    ? (sp.tab as ReportTab)
    : availableTabs[0]!.id;
  const groupBy = sp.groupBy === 'week' || sp.groupBy === 'month' ? sp.groupBy : 'day';
  const fmt = settings.settings;
  const rangeQuery = { from: sp.from, to: sp.to };
  const pageQuery = { page: sp.page, pageSize: sp.pageSize };

  let salesData: {
    summary: SalesSummaryReport;
    byProduct: SalesByProductReport;
    byCustomer: SalesByCustomerReport;
  } | null = null;
  let purchasesData: PurchasesReport | null = null;
  let inventoryData: {
    summary: InventorySummaryReport;
    valuation: InventoryValuationReport | null;
  } | null = null;
  let financialData: {
    summary: FinancialSummaryReport;
    aging: FinancialAgingReport;
  } | null = null;

  let activeRangeFrom = sp.from ?? '';
  let activeRangeTo = sp.to ?? '';
  let activeAsOf = sp.asOf ?? '';

  if (activeTab === 'sales') {
    const [summary, byProduct, byCustomer] = await Promise.all([
      apiFetch<SalesSummaryReport>('/reports/sales/summary', { query: { ...rangeQuery, groupBy } }),
      apiFetch<SalesByProductReport>('/reports/sales/by-product', { query: { ...rangeQuery, ...pageQuery } }),
      apiFetch<SalesByCustomerReport>('/reports/sales/by-customer', { query: { ...rangeQuery, ...pageQuery } }),
    ]);
    salesData = { summary, byProduct, byCustomer };
    activeRangeFrom = summary.range.from;
    activeRangeTo = summary.range.to;
  } else if (activeTab === 'purchases') {
    purchasesData = await apiFetch<PurchasesReport>('/reports/purchases', {
      query: { ...rangeQuery, ...pageQuery },
    });
    activeRangeFrom = purchasesData.range.from;
    activeRangeTo = purchasesData.range.to;
  } else if (activeTab === 'inventory') {
    const canCost = can(user, 'products.view_cost');
    const [summary, valuation] = await Promise.all([
      apiFetch<InventorySummaryReport>('/reports/inventory/summary', { query: rangeQuery }),
      canCost
        ? apiFetch<InventoryValuationReport>('/reports/inventory/valuation', { query: pageQuery })
        : Promise.resolve(null),
    ]);
    inventoryData = { summary, valuation };
    activeRangeFrom = summary.range.from;
    activeRangeTo = summary.range.to;
  } else if (activeTab === 'financial') {
    const [summary, aging] = await Promise.all([
      apiFetch<FinancialSummaryReport>('/reports/financial/summary', { query: rangeQuery }),
      apiFetch<FinancialAgingReport>('/reports/financial/aging', { query: { asOf: sp.asOf } }),
    ]);
    financialData = { summary, aging };
    activeRangeFrom = summary.range.from;
    activeRangeTo = summary.range.to;
    activeAsOf = aging.asOf;
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Operational, inventory valuation, and financial reports with CSV export."
      />
      <ReportsControls
        key={`${activeTab}-${activeRangeFrom}-${activeRangeTo}-${activeAsOf}`}
        activeTab={activeTab}
        availableTabs={availableTabs}
        from={activeRangeFrom}
        to={activeRangeTo}
        groupBy={groupBy}
        asOf={activeAsOf}
      />

      {salesData ? (
        <SalesReportView
          summary={salesData.summary}
          byProduct={salesData.byProduct}
          byCustomer={salesData.byCustomer}
          canViewCost={can(user, 'products.view_cost')}
          formatSettings={fmt}
        />
      ) : null}

      {purchasesData ? <PurchasesReportView report={purchasesData} formatSettings={fmt} /> : null}

      {inventoryData ? (
        <InventoryReportView
          summary={inventoryData.summary}
          valuation={inventoryData.valuation}
          formatSettings={fmt}
        />
      ) : null}

      {financialData ? (
        <FinancialReportView
          summary={financialData.summary}
          aging={financialData.aging}
          formatSettings={fmt}
        />
      ) : null}
    </>
  );
}
