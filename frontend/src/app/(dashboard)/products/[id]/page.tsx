import type { Metadata } from 'next';
import type { Category, ProductDetail } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { ProductDetailClient } from './product-detail-client';

export const metadata: Metadata = { title: 'Product Detail' };

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'products.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const [product, categoriesPage] = await Promise.all([
    apiFetch<ProductDetail>(`/products/${id}`),
    can(user, 'categories.read')
      ? apiFetchPage<Category>('/categories', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Category[] }),
  ]);

  return (
    <>
      <PageHeader
        title={product.name}
        description={`SKU: ${product.sku}`}
        backHref="/products"
        backLabel="Back to Products"
      />
      <ProductDetailClient
        key={product.updatedAt}
        product={product}
        categories={categoriesPage.data}
        canManage={can(user, 'products.manage')}
        canViewCost={can(user, 'products.view_cost')}
        formatSettings={settings.settings}
      />
    </>
  );
}
