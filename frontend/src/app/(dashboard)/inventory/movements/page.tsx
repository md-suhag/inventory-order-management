import type { Metadata } from 'next';
import type { InventoryMovement, Product } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { MovementsClient } from './movements-client';

export const metadata: Metadata = { title: 'Stock Movements' };

export default async function InventoryMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    productId?: string;
    type?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'inventory.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: movements, meta }, productsPage] = await Promise.all([
    apiFetchPage<InventoryMovement>('/inventory/movements', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        productId: sp.productId,
        type: sp.type,
        from: sp.from,
        to: sp.to,
        sort: sp.sort,
      },
    }),
    can(user, 'products.read')
      ? apiFetchPage<Product>('/products', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Product[] }),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory Movement Ledger"
        description="Append-only audit trail of every stock change across the business."
        backHref="/inventory"
        backLabel="Back to Inventory"
      />
      <MovementsClient
        movements={movements}
        meta={meta}
        products={productsPage.data}
        canViewCost={can(user, 'products.view_cost')}
        formatSettings={settings.settings}
      />
    </>
  );
}
