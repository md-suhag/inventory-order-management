'use client';

import * as React from 'react';
import { Eye } from 'lucide-react';
import type { AuditLogItem, PageMeta, User } from '@/lib/api-types';
import { formatDate, type FormatSettings } from '@/lib/format';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function AuditLogsClient({
  logs,
  meta,
  users,
  formatSettings,
}: {
  logs: AuditLogItem[];
  meta: PageMeta;
  users: User[];
  formatSettings: FormatSettings;
}) {
  const [selected, setSelected] = React.useState<AuditLogItem | null>(null);

  return (
    <div className="space-y-4">
      <SearchFilterBar
        searchPlaceholder="Search action, entity type, entity ID, IP, or actor…"
        filters={[
          {
            key: 'actorId',
            label: 'Actor',
            type: 'select',
            options: users.map((u) => ({ label: u.name, value: u.id })),
          },
          {
            key: 'entityType',
            label: 'Entity',
            type: 'select',
            options: [
              { label: 'user', value: 'user' },
              { label: 'role', value: 'role' },
              { label: 'product', value: 'product' },
              { label: 'category', value: 'category' },
              { label: 'supplier', value: 'supplier' },
              { label: 'customer', value: 'customer' },
              { label: 'purchase', value: 'purchase' },
              { label: 'order', value: 'order' },
              { label: 'payment', value: 'payment' },
              { label: 'sales_return', value: 'sales_return' },
              { label: 'inventory_movement', value: 'inventory_movement' },
              { label: 'business_setting', value: 'business_setting' },
            ],
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Oldest First', value: 'createdAt:asc' },
          { label: 'Action (A–Z)', value: 'action:asc' },
          { label: 'Entity Type (A–Z)', value: 'entityType:asc' },
        ]}
      />

      {logs.length === 0 ? (
        <EmptyState title="No audit records match your filters" />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>IP Address</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(log.createdAt, formatSettings, true)}
                  </TableCell>
                  <TableCell>
                    {log.actor ? (
                      <>
                        <div className="font-medium text-sm">{log.actor.name}</div>
                        <div className="text-xs text-muted-foreground">{log.actor.email}</div>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">System / Unauthenticated</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{log.action}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{log.entityType}</div>
                    {log.entityId ? (
                      <div className="font-mono text-[11px] text-muted-foreground truncate max-w-[180px]">
                        {log.entityId}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.ipAddress ?? '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelected(log)} title="Inspect">
                      <Eye className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{selected?.action}</DialogTitle>
            <DialogDescription>
              {selected ? formatDate(selected.createdAt, formatSettings, true) : ''}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Actor</dt>
                  <dd>{selected.actor ? `${selected.actor.name} (${selected.actor.email})` : 'System'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Entity</dt>
                  <dd className="font-mono text-xs">
                    {selected.entityType} {selected.entityId ? `/ ${selected.entityId}` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">IP Address</dt>
                  <dd className="font-mono text-xs">{selected.ipAddress ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Request ID</dt>
                  <dd className="font-mono text-xs truncate">{selected.requestId ?? '—'}</dd>
                </div>
              </dl>
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Metadata</p>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
                  {JSON.stringify(selected.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
