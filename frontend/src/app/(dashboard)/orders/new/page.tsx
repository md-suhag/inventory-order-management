import type { Metadata } from 'next';
import type { Customer, Product } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { OrderEditor } from '../order-editor';

export const metadata: Metadata = { title: 'New Order' };

export default async function NewOrderPage() {
  const { user, settings } = await requireSession();
  if (!can(user, 'orders.manage')) {
    return <AccessDenied />;
  }

  const [customersPage, productsPage] = await Promise.all([
    can(user, 'customers.read')
      ? apiFetchPage<Customer>('/customers', { query: { status: 'ACTIVE', pageSize: 100 } })
      : Promise.resolve({ data: [] as Customer[] }),
    apiFetchPage<Product>('/products', { query: { status: 'ACTIVE', pageSize: 100 } }),
  ]);

  return (
    <>
      <PageHeader
        title="New Sales Order"
        description="Create a draft order for a saved or walk-in customer."
        backHref="/orders"
        backLabel="Back to Orders"
      />
      <OrderEditor
        customers={customersPage.data}
        products={productsPage.data}
        settings={settings.settings}
        canDiscount={can(user, 'orders.discount')}
      />
    </>
  );
}
