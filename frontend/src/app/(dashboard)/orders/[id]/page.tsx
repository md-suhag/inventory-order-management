import type { Metadata } from 'next';
import type { Customer, OrderDetail, Product } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { OrderDetailClient } from './order-detail-client';

export const metadata: Metadata = { title: 'Order Detail' };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'orders.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const order = await apiFetch<OrderDetail>(`/orders/${id}`);

  const canManage = can(user, 'orders.manage');
  const [customersPage, productsPage] =
    order.status === 'DRAFT' && canManage
      ? await Promise.all([
          can(user, 'customers.read')
            ? apiFetchPage<Customer>('/customers', { query: { pageSize: 100 } })
            : Promise.resolve({ data: [] as Customer[] }),
          can(user, 'products.read')
            ? apiFetchPage<Product>('/products', { query: { pageSize: 100 } })
            : Promise.resolve({ data: [] as Product[] }),
        ])
      : [{ data: [] as Customer[] }, { data: [] as Product[] }];

  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={order.invoiceNumber ? `Invoice ${order.invoiceNumber}` : 'Draft customer order'}
        backHref="/orders"
        backLabel="Back to Orders"
      />
      <OrderDetailClient
        key={order.updatedAt}
        order={order}
        customers={customersPage.data}
        products={productsPage.data}
        paymentMethods={settings.paymentMethods}
        settings={settings.settings}
        permissions={{
          canManage,
          canConfirm: can(user, 'orders.confirm'),
          canComplete: can(user, 'orders.complete'),
          canCancelConfirmed: can(user, 'orders.cancel'),
          canDiscount: can(user, 'orders.discount'),
          canRecordPayment: can(user, 'payments.record_customer'),
          canRefund: can(user, 'payments.refund'),
          canReverse: can(user, 'payments.reverse'),
          canCreateReturn: can(user, 'returns.create'),
        }}
      />
    </>
  );
}
