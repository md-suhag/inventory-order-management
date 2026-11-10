import type { Metadata } from 'next';
import type { Role, User } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { UsersClient } from './users-client';

export const metadata: Metadata = { title: 'Users' };

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    roleId?: string;
    isActive?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'users.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: users, meta }, rolesPage] = await Promise.all([
    apiFetchPage<User>('/users', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        search: sp.search,
        roleId: sp.roleId,
        isActive: sp.isActive,
        sort: sp.sort,
      },
    }),
    can(user, 'roles.read')
      ? apiFetchPage<Role>('/roles', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as Role[] }),
  ]);

  return (
    <>
      <PageHeader title="User Management" description="Manage staff accounts, roles, and activation status." />
      <UsersClient
        users={users}
        meta={meta}
        roles={rolesPage.data}
        currentUserId={user.id}
        canManage={can(user, 'users.manage')}
        formatSettings={settings.settings}
      />
    </>
  );
}
