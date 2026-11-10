'use client';

import * as React from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import type { InventoryMovement, PageMeta, Product } from '@/lib/api-types';
import { formatCost, formatDate, type FormatSettings } from '@/lib/format';
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

export function MovementsClient({
  movements,
  meta,
  products,
  canViewCost,
  formatSettings,
}: {
  movements: InventoryMovement[];
  meta: PageMeta;
  products: Product[];
  canViewCost: boolean;
  formatSettings: FormatSettings;
}) {
  const [selected, setSelected] = React.useState<InventoryMovement | null>(null);

  return (
    <div className="space-y-4">
      <SearchFilterBar
        hideSearch
        filters={[
          {
            key: 'productId',
            label: 'Product',
            type: 'select',
            options: products.map((p) => ({ label: `${p.sku} — ${p.name}`, value: p.id })),
          },
          {
            key: 'type',
            label: 'Type',
            type: 'select',
            options: [
              { label: 'Opening Stock', value: 'OPENING_STOCK' },
              { label: 'Purchase Receipt', value: 'PURCHASE_RECEIPT' },
              { label: 'Sale', value: 'SALE' },
              { label: 'Sale Cancellation', value: 'SALE_CANCELLATION' },
              { label: 'Sale Return', value: 'SALE_RETURN' },
              { label: 'Adjustment In', value: 'ADJUSTMENT_IN' },
              { label: 'Adjustment Out', value: 'ADJUSTMENT_OUT' },
            ],
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Oldest First', value: 'createdAt:asc' },
          { label: 'Qty Change (High–Low)', value: 'quantityChange:desc' },
          { label: 'Qty Change (Low–High)', value: 'quantityChange:asc' },
        ]}
      />

      {movements.length === 0 ? (
        <EmptyState
          title="No inventory movements found"
          description="Movements are appended automatically on opening stock, receipts, sales, returns, and adjustments."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Change</TableHead>
                <TableHead className="text-right">Before → After</TableHead>
                {canViewCost ? <TableHead className="text-right">Unit Cost</TableHead> : null}
                <TableHead>Reference / Reason</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(m.createdAt, formatSettings, true)}
                  </TableCell>
                  <TableCell>
                    <Link href={`/products/${m.productId}`} className="font-medium hover:underline">
                      {m.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{m.productSku}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.type}</TableCell>
                  <TableCell
                    className={`text-right font-mono font-semibold ${
                      m.quantityChange >= 0 ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {m.previousStock} → {m.resultingStock}
                  </TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right font-mono text-xs">
                      {formatCost(m.unitCost, formatSettings)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-xs text-muted-foreground">
                    {m.referenceNumber ?? m.adjustmentReason ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs">{m.performedBy?.name ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon-sm" onClick={() => setSelected(m)} title="View details">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Movement Detail</DialogTitle>
            <DialogDescription>Immutable inventory ledger record.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Product</dt>
                <dd className="font-medium">
                  {selected.productName} ({selected.productSku})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd className="font-mono text-xs">{selected.type}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Quantity Change</dt>
                <dd className="font-mono font-semibold">
                  {selected.quantityChange > 0 ? `+${selected.quantityChange}` : selected.quantityChange}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock Transition</dt>
                <dd className="font-mono">
                  {selected.previousStock} → {selected.resultingStock}
                </dd>
              </div>
              {canViewCost ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Unit Cost</dt>
                  <dd className="font-mono">{formatCost(selected.unitCost, formatSettings)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Reference / Reason</dt>
                <dd>{selected.referenceNumber ?? selected.adjustmentReason ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Performed By</dt>
                <dd>{selected.performedBy?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Timestamp</dt>
                <dd>{formatDate(selected.createdAt, formatSettings, true)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="text-muted-foreground">{selected.notes ?? '—'}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
