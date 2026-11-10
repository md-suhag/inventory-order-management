import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { PurchaseListItem, Supplier } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { formatDate, formatMoney } from '@/lib/format';
import { AccessDenied } from '@/components/shared/access-denied';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const metadata: Metadata = { title: 'Purchases' };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    supplierId?: string;
    status?: string;
    paymentStatus?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'purchases.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const fmt = settings.settings;

  const [{ data: purchases, meta }, suppliersPage] = await Promise.all([
    apiFetchPage<PurchaseListItem>('/purchases', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        search: sp.search,
        supplierId: sp.supplierId,
        status: sp.status,
        paymentStatus: sp.paymentStatus,
        from: sp.from,
        to: sp.to,
        sort: sp.sort,
      },
    }),
    can(user, 'suppliers.read')
      ? apiFetchPage<Supplier>('/suppliers', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Supplier[] }),
  ]);

  const canManage = can(user, 'purchases.manage');

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Manage supplier purchase orders and goods receiving."
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/purchases/new">
                <Plus className="size-4" />
                New Purchase
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SearchFilterBar
        searchPlaceholder="Search by purchase # or supplier reference…"
        filters={[
          {
            key: 'supplierId',
            label: 'Supplier',
            type: 'select',
            options: suppliersPage.data.map((s) => ({ label: s.name, value: s.id })),
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Ordered', value: 'ORDERED' },
              { label: 'Partially Received', value: 'PARTIALLY_RECEIVED' },
              { label: 'Received', value: 'RECEIVED' },
              { label: 'Cancelled', value: 'CANCELLED' },
            ],
          },
          {
            key: 'paymentStatus',
            label: 'Payment',
            type: 'select',
            options: [
              { label: 'Unpaid', value: 'UNPAID' },
              { label: 'Partially Paid', value: 'PARTIALLY_PAID' },
              { label: 'Paid', value: 'PAID' },
            ],
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Purchase # (Desc)', value: 'purchaseNumber:desc' },
          { label: 'Total (High–Low)', value: 'totalAmount:desc' },
        ]}
      />

      {purchases.length === 0 ? (
        <EmptyState
          title="No purchases found"
          description="Create a draft purchase order to replenish inventory from a supplier."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase #</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`/purchases/${p.id}`} className="font-mono text-xs font-semibold hover:underline">
                      {p.purchaseNumber}
                    </Link>
                    {p.supplierReference ? (
                      <div className="text-[11px] text-muted-foreground">Ref: {p.supplierReference}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={p.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-right font-mono">{p.itemCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(p.totalAmount, fmt)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(p.balanceDue, fmt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(p.createdAt, fmt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />
    </>
  );
}
