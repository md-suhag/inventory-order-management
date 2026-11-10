import type { Metadata } from 'next';
import type { Customer } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { CustomersClient } from './customers-client';

export const metadata: Metadata = { title: 'Customers' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string; sort?: string }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'customers.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const { data, meta } = await apiFetchPage<Customer>('/customers', {
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
      <PageHeader title="Customers" description="Manage customer accounts and view receivable balances." />
      <CustomersClient
        customers={data}
        meta={meta}
        canManage={can(user, 'customers.manage')}
        formatSettings={settings.settings}
      />
    </>
  );
}
