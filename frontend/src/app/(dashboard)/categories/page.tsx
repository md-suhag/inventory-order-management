import type { Metadata } from 'next';
import type { Category } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { CategoriesClient } from './categories-client';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string; sort?: string }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'categories.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const { data, meta } = await apiFetchPage<Category>('/categories', {
    query: {
      page: sp.page,
      pageSize: sp.pageSize,
      search: sp.search,
      status: sp.status,
      sort: sp.sort,
    },
  });

  return (
    <>
      <PageHeader title="Categories" description="Organize your product catalog by category." />
      <CategoriesClient
        categories={data}
        meta={meta}
        canManage={can(user, 'categories.manage')}
        formatSettings={settings.settings}
      />
    </>
  );
}
