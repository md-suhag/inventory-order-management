import { z } from 'zod';
import { listQuerySchema, queryDate } from '../../common/query/list-query';
import { uuidSchema } from '../../common/validation/schemas';

export const AUDIT_LOGS_SORT_FIELDS = ['createdAt', 'action', 'entityType'] as const;
export type AuditLogSortField = (typeof AUDIT_LOGS_SORT_FIELDS)[number];

export const listAuditLogsQuerySchema = listQuerySchema(AUDIT_LOGS_SORT_FIELDS).extend({
  actorId: uuidSchema.optional(),
  action: z.string().trim().optional(),
  entityType: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  from: queryDate.transform((v) => v?.slice(0, 10)),
  to: queryDate.transform((v) => v?.slice(0, 10)),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
