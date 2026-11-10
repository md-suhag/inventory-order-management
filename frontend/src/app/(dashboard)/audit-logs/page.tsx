import type { Metadata } from 'next';
import type { AuditLogItem, User } from '@/lib/api-types';
import { apiFetchPage } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { AuditLogsClient } from './audit-logs-client';

export const metadata: Metadata = { title: 'Audit Logs' };

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    search?: string;
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { user, settings } = await requireSession();
  if (!can(user, 'audit_logs.read')) {
    return <AccessDenied />;
  }

  const sp = await searchParams;
  const [{ data: logs, meta }, usersPage] = await Promise.all([
    apiFetchPage<AuditLogItem>('/audit-logs', {
      query: {
        page: sp.page,
        pageSize: sp.pageSize,
        search: sp.search,
        actorId: sp.actorId,
        action: sp.action,
        entityType: sp.entityType,
        entityId: sp.entityId,
        from: sp.from,
        to: sp.to,
        sort: sp.sort,
      },
    }),
    can(user, 'users.read')
      ? apiFetchPage<User>('/users', { query: { pageSize: 100 } })
      : Promise.resolve({ data: [] as User[] }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit Logs"
        description="Tamper-evident ledger of system, security, inventory, and financial events."
      />
      <AuditLogsClient
        logs={logs}
        meta={meta}
        users={usersPage.data}
        formatSettings={settings.settings}
      />
    </>
  );
}
