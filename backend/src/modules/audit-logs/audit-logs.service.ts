import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { notFound } from '../../common/errors/app-error';
import { buildListArgs, paginate, type Paginated } from '../../common/query/list-query';
import { publicUserSelect } from '../users/users.presenter';
import type { AuditLogSortField, ListAuditLogsQuery } from './audit-logs.schemas';

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
  actor: unknown;
}

const auditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  requestId: true,
  createdAt: true,
  actor: { select: publicUserSelect },
} as const;

export async function listAuditLogs(query: ListAuditLogsQuery): Promise<Paginated<AuditLogItem>> {
  const filters: Prisma.AuditLogWhereInput[] = [];

  if (query.actorId) filters.push({ actorId: query.actorId });
  if (query.action) filters.push({ action: { equals: query.action, mode: 'insensitive' } });
  if (query.entityType) filters.push({ entityType: { equals: query.entityType, mode: 'insensitive' } });
  if (query.entityId) filters.push({ entityId: query.entityId });

  if (query.from || query.to) {
    filters.push({
      createdAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const listArgs = buildListArgs<
    AuditLogSortField,
    Prisma.AuditLogWhereInput,
    Prisma.AuditLogOrderByWithRelationInput
  >(
    query,
    {
      searchFields: ['action', 'entityType', 'entityId', 'ipAddress', 'actor.name', 'actor.email'],
      sortFields: {
        createdAt: 'createdAt',
        action: 'action',
        entityType: 'entityType',
      },
      defaultSort: [{ field: 'createdAt', direction: 'desc' }],
    },
    filters,
  );

  return paginate(
    query,
    () =>
      prisma.auditLog.findMany({
        ...listArgs,
        select: auditLogSelect,
      }),
    () => prisma.auditLog.count({ where: listArgs.where }),
  );
}

export async function getAuditLog(id: string): Promise<AuditLogItem> {
  const row = await prisma.auditLog.findUnique({
    where: { id },
    select: auditLogSelect,
  });
  if (!row) throw notFound('Audit log');
  return row;
}
