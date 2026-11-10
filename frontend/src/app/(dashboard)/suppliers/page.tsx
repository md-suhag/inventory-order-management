import type { Metadata } from 'next';
import type { Supplier } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { SuppliersClient } from './suppliers-client';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string; sort?: string }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'suppliers.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const { data, meta } = await apiFetchPage<Supplier>('/suppliers', {
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
      <PageHeader title="Suppliers" description="Manage vendor profiles and procurement contacts." />
      <SuppliersClient
        suppliers={data}
        meta={meta}
        canManage={can(user, 'suppliers.manage')}
        formatSettings={settings.settings}
      />
    </>
  );
}
