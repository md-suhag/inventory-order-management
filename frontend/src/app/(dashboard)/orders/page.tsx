import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import type { Customer, OrderListItem } from '@/lib/api-types';
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

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    customerId?: string;
    status?: string;
    paymentStatus?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'orders.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const fmt = settings.settings;

  const [{ data: orders, meta }, customersPage] = await Promise.all([
    apiFetchPage<OrderListItem>('/orders', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        search: sp.search,
        customerId: sp.customerId,
        status: sp.status,
        paymentStatus: sp.paymentStatus,
        from: sp.from,
        to: sp.to,
        sort: sp.sort,
      },
    }),
    can(user, 'customers.read')
      ? apiFetchPage<Customer>('/customers', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Customer[] }),
  ]);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Manage customer orders, fulfillment, invoices, and payments."
        actions={
          can(user, 'orders.manage') ? (
            <Button asChild>
              <Link href="/orders/new">
                <Plus className="size-4" />
                New Order
              </Link>
            </Button>
          ) : undefined
        }
      />

      <SearchFilterBar
        searchPlaceholder="Search by order #, invoice #, customer name, or phone…"
        filters={[
          {
            key: 'customerId',
            label: 'Customer',
            type: 'select',
            options: customersPage.data.map((c) => ({ label: c.name, value: c.id })),
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Confirmed', value: 'CONFIRMED' },
              { label: 'Shipped', value: 'SHIPPED' },
              { label: 'Delivered', value: 'DELIVERED' },
              { label: 'Completed', value: 'COMPLETED' },
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
              { label: 'Partially Refunded', value: 'PARTIALLY_REFUNDED' },
              { label: 'Refunded', value: 'REFUNDED' },
            ],
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Order # (Desc)', value: 'orderNumber:desc' },
          { label: 'Total (High–Low)', value: 'totalAmount:desc' },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState title="No orders found" description="Create a draft sales order for a customer or walk-in." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order / Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance Due</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link href={`/orders/${o.id}`} className="font-mono text-xs font-semibold hover:underline">
                      {o.orderNumber}
                    </Link>
                    {o.invoiceNumber ? (
                      <div className="font-mono text-[11px] text-muted-foreground">{o.invoiceNumber}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <div>{o.customerName ?? 'Walk-in'}</div>
                    {o.customerPhone ? (
                      <div className="text-xs text-muted-foreground">{o.customerPhone}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={o.paymentStatus} />
                  </TableCell>
                  <TableCell className="text-right font-mono">{o.itemCount}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(o.totalAmount, fmt)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(o.balanceDue, fmt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(o.createdAt, fmt)}</TableCell>
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
