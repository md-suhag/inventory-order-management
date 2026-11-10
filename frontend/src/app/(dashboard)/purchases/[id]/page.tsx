import type { Metadata } from 'next';
import type { Product, PurchaseDetail, Supplier } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { PurchaseDetailClient } from './purchase-detail-client';

export const metadata: Metadata = { title: 'Purchase Detail' };

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'purchases.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const purchase = await apiFetch<PurchaseDetail>(`/purchases/${id}`);

  const canManage = can(user, 'purchases.manage');
  const [suppliersPage, productsPage] =
    purchase.status === 'DRAFT' && canManage
      ? await Promise.all([
          apiFetchPage<Supplier>('/suppliers', { query: { pageSize: 100 } }),
          apiFetchPage<Product>('/products', { query: { pageSize: 100 } }),
        ])
      : [{ data: [] as Supplier[] }, { data: [] as Product[] }];

  return (
    <>
      <PageHeader
        title={purchase.purchaseNumber}
        description={`Purchase order for ${purchase.supplier.name}`}
        backHref="/purchases"
        backLabel="Back to Purchases"
      />
      <PurchaseDetailClient
        key={purchase.updatedAt}
        purchase={purchase}
        suppliers={suppliersPage.data}
        products={productsPage.data}
        settings={settings.settings}
        permissions={{
          canManage,
          canConfirm: can(user, 'purchases.confirm'),
          canReceive: can(user, 'purchases.receive'),
          canCancel: can(user, 'purchases.cancel'),
        }}
      />
    </>
  );
}
