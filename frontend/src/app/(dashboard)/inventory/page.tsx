import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeftRight } from 'lucide-react';
import type { Category, InventoryProductItem } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { InventoryClient } from './inventory-client';

export const metadata: Metadata = { title: 'Inventory' };

export default async function InventoryPage({
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
  if (!can(user, 'inventory.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: items, meta }, lowStockItems, categoriesPage] = await Promise.all([
    apiFetchPage<InventoryProductItem>('/inventory', {
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
    apiFetch<InventoryProductItem[]>('/inventory/low-stock'),
    can(user, 'categories.read')
      ? apiFetchPage<Category>('/categories', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Category[] }),
  ]);

  return (
    <>
      <PageHeader
        title="Inventory Overview"
        description="Live stock quantities, thresholds, valuation, and manual adjustments."
        actions={
          <Button asChild variant="outline">
            <Link href="/inventory/movements">
              <ArrowLeftRight className="size-4" />
              Movement Ledger
            </Link>
          </Button>
        }
      />
      <InventoryClient
        items={items}
        meta={meta}
        lowStockCount={lowStockItems.length}
        categories={categoriesPage.data}
        canAdjust={can(user, 'inventory.adjust')}
        canViewCost={can(user, 'products.view_cost')}
        formatSettings={settings.settings}
      />
    </>
  );
}
