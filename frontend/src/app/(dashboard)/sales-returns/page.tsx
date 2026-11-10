import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { SalesReturnListItem } from '@/lib/api-types';
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

export const metadata: Metadata = { title: 'Sales Returns' };

export default async function SalesReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'returns.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const fmt = settings.settings;

  const { data: returnsList, meta } = await apiFetchPage<SalesReturnListItem>('/sales-returns', {
    query: {
      page: sp.page,
      pageSize: sp.pageSize,
      search: sp.search,
      status: sp.status,
      from: sp.from,
      to: sp.to,
      sort: sp.sort,
    },
  });

  return (
    <>
      <PageHeader
        title="Sales Returns"
        description="Manage return requests, resalable restocking, and customer return refunds."
        actions={
          can(user, 'returns.create') ? (
            <Button asChild>
              <Link href="/sales-returns/new">
                <Plus className="size-4" />
                Request Return
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SearchFilterBar
        searchPlaceholder="Search by return #, order #, customer, or reason…"
        filters={[
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Pending', value: 'PENDING' },
              { label: 'Completed', value: 'COMPLETED' },
              { label: 'Rejected', value: 'REJECTED' },
            ],
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Return # (Desc)', value: 'returnNumber:desc' },
          { label: 'Credit (High–Low)', value: 'totalAmount:desc' },
        ]}
      />

      {returnsList.length === 0 ? (
        <EmptyState
          title="No sales returns found"
          description="Return requests can be initiated against DELIVERED or COMPLETED orders."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Credit Total</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returnsList.map((ret) => (
                <TableRow key={ret.id}>
                  <TableCell>
                    <Link href={`/sales-returns/${ret.id}`} className="font-mono text-xs font-semibold hover:underline">
                      {ret.returnNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/orders/${ret.orderId}`} className="font-mono text-xs text-primary hover:underline">
                      {ret.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{ret.customerName ?? 'Walk-in'}</TableCell>
                  <TableCell>
                    <StatusBadge status={ret.status} />
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{ret.reason}</TableCell>
                  <TableCell className="text-right font-mono">{ret.itemCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(ret.totalAmount, fmt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(ret.createdAt, fmt)}</TableCell>
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
