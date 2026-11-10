import type { Metadata } from 'next';
import type { Product, Supplier } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { PurchaseEditor } from '../purchase-editor';

export const metadata: Metadata = { title: 'New Purchase' };

export default async function NewPurchasePage() {
  const { user, settings } = await requireSession();
  if (!can(user, 'purchases.manage')) {
    return <AccessDenied />;
  }

  const [suppliersPage, productsPage] = await Promise.all([
    apiFetchPage<Supplier>('/suppliers', { query: { status: 'ACTIVE', pageSize: 100 } }),
    apiFetchPage<Product>('/products', { query: { status: 'ACTIVE', pageSize: 100 } }),
  ]);

  return (
    <>
      <PageHeader
        title="New Purchase Order"
        description="Create a draft purchase order from an active supplier."
        backHref="/purchases"
        backLabel="Back to Purchases"
      />
      <PurchaseEditor
        suppliers={suppliersPage.data}
        products={productsPage.data}
        settings={settings.settings}
      />
    </>
  );
}
