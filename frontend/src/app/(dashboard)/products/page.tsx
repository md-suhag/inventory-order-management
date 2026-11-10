import type { Metadata } from 'next';
import type { Category, Product } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { ProductsClient } from './products-client';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    categoryId?: string;
    status?: string;
    stockState?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'products.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: products, meta }, categoriesPage] = await Promise.all([
    apiFetchPage<Product>('/products', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        search: sp.search,
        categoryId: sp.categoryId,
        status: sp.status,
        stockState: sp.stockState,
        sort: sp.sort,
      },
    }),
    can(user, 'categories.read')
      ? apiFetchPage<Category>('/categories', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Category[] }),
  ]);

  return (
    <>
      <PageHeader title="Products" description="Manage SKU catalog, pricing, images, and stock levels." />
      <ProductsClient
        products={products}
        meta={meta}
        categories={categoriesPage.data}
        canManage={can(user, 'products.manage')}
        canViewCost={can(user, 'products.view_cost')}
        formatSettings={settings.settings}
      />
    </>
  );
}
