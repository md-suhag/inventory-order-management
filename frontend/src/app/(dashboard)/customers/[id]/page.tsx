import type { Metadata } from 'next';
import type { CustomerDetail, OrderListItem } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { CustomerDetailClient } from './customer-detail-client';

export const metadata: Metadata = { title: 'Customer Detail' };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'customers.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const [customer, ordersPage] = await Promise.all([
    apiFetch<CustomerDetail>(`/customers/${id}`),
    can(user, 'orders.read')
      ? apiFetchPage<OrderListItem>('/orders', { query: { customerId: id, pageSize: 10 } })
      : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title={customer.name}
        description="Customer account, receivable summary, and order history."
        backHref="/customers"
        backLabel="Back to Customers"
      />
      <CustomerDetailClient
        key={customer.updatedAt}
        customer={customer}
        orders={ordersPage?.data ?? null}
        canManage={can(user, 'customers.manage')}
        canArchive={can(user, 'customers.archive')}
        formatSettings={settings.settings}
      />
    </>
  );
}
