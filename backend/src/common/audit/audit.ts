import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import type { Db } from '../../config/prisma';

/** Request-derived context stored with each audit entry. */
export interface RequestContext {
  actorId: string | null;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export function requestContext(req: Request, actorId: string | null = req.auth?.userId ?? null): RequestContext {
  return {
    actorId,
    ipAddress: req.ip?.slice(0, 45),
    userAgent: req.get('user-agent')?.slice(0, 255),
    requestId: String(req.id),
  };
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Writes an audit log row. Pass the transaction client so the entry commits or rolls back
 * together with the change it describes (FR-AUD-03). Never put secrets in metadata.
 */
export async function recordAudit(db: Db, ctx: RequestContext, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: ctx.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    },
  });
}

/** Field-level diff for update audits: only changed keys, with before/after values. */
export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key];
    const to = after[key];
    if (to !== undefined && String(from ?? '') !== String(to ?? '')) changes[key] = { from: from ?? null, to: to ?? null };
  }
  return changes;
}
