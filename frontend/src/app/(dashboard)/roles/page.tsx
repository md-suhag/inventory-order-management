import type { Metadata } from 'next';
import type { PermissionInfo, Role } from '@/lib/api-types';
import { apiFetch, apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { RolesClient } from './roles-client';

export const metadata: Metadata = { title: 'Roles & Permissions' };

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string }>;
}) {
  const { user } = await requireSession();
  if (!can(user, 'roles.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: roles, meta }, catalogue] = await Promise.all([
    apiFetchPage<Role>('/roles', { query: { page: sp.page, pageSize: sp.pageSize } }),
    apiFetch<PermissionInfo[]>('/roles/permissions'),
  ]);

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        description="Configure RBAC permission sets for system and custom roles."
      />
      <RolesClient
        roles={roles}
        meta={meta}
        catalogue={catalogue}
        canManage={can(user, 'roles.manage')}
      />
    </>
  );
}
