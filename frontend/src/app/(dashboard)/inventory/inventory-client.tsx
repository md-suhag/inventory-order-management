'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AdjustmentReason,
  Category,
  InventoryProductItem,
  PageMeta,
} from '@/lib/api-types';
import { createAdjustmentAction } from '@/lib/actions/inventory';
import { formatCost, formatMoney, type FormatSettings } from '@/lib/format';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorBanner } from '@/components/shared/error-banner';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

const REASONS: { label: string; value: AdjustmentReason }[] = [
  { label: 'Count Correction', value: 'COUNT_CORRECTION' },
  { label: 'Found', value: 'FOUND' },
  { label: 'Damaged', value: 'DAMAGED' },
  { label: 'Expired', value: 'EXPIRED' },
  { label: 'Lost', value: 'LOST' },
  { label: 'Stolen', value: 'STOLEN' },
  { label: 'Other (notes required)', value: 'OTHER' },
];

export function InventoryClient({
  items,
  meta,
  lowStockCount,
  categories,
  canAdjust,
  canViewCost,
  formatSettings,
}: {
  items: InventoryProductItem[];
  meta: PageMeta;
  lowStockCount: number;
  categories: Category[];
  canAdjust: boolean;
  canViewCost: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [target, setTarget] = React.useState<InventoryProductItem | null>(null);
  const [direction, setDirection] = React.useState<'IN' | 'OUT'>('IN');
  const [quantity, setQuantity] = React.useState('1');
  const [reason, setReason] = React.useState<AdjustmentReason>('COUNT_CORRECTION');
  const [notes, setNotes] = React.useState('');
  const [idempotencyKey, setIdempotencyKey] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function openAdjust(item: InventoryProductItem) {
    setTarget(item);
    setDirection('IN');
    setQuantity('1');
    setReason('COUNT_CORRECTION');
    setNotes('');
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setError(null);
    const qtyNum = Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
      setError('Quantity must be a positive whole number.');
      return;
    }
    if (reason === 'OTHER' && !notes.trim()) {
      setError('Notes are required when adjustment reason is OTHER.');
      return;
    }

    startTransition(async () => {
      const res = await createAdjustmentAction(
        {
          productId: target.id,
          direction,
          quantity: qtyNum,
          reason,
          notes: notes.trim() || null,
        },
        idempotencyKey,
      );
      if (res.ok) {
        toast.success(
          `Stock adjusted (${res.data.previousStock} → ${res.data.resultingStock})`,
        );
        setTarget(null);
        router.refresh();
      } else {
        setError(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {lowStockCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <span>
              <span className="font-semibold">{lowStockCount}</span> active product(s) are currently low or out of
              stock.
            </span>
          </div>
          <Button asChild size="sm" variant="outline" className="bg-white">
            <Link href="/inventory?stockState=LOW,OUT">Filter Low / Out</Link>
          </Button>
        </div>
      ) : null}

      <SearchFilterBar
        searchPlaceholder="Search inventory by name, SKU, or barcode…"
        filters={[
          {
            key: 'categoryId',
            label: 'Category',
            type: 'select',
            options: categories.map((c) => ({ label: c.name, value: c.id })),
          },
          {
            key: 'stockState',
            label: 'Stock State',
            type: 'select',
            options: [
              { label: 'In Stock', value: 'IN_STOCK' },
              { label: 'Low Stock', value: 'LOW' },
              { label: 'Out of Stock', value: 'OUT' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            type: 'select',
            options: [
              { label: 'Active', value: 'ACTIVE' },
              { label: 'Inactive', value: 'INACTIVE' },
              { label: 'Archived', value: 'ARCHIVED' },
            ],
          },
        ]}
        sortOptions={[
          { label: 'Name (A–Z)', value: 'name:asc' },
          { label: 'Stock (Low–High)', value: 'stockQuantity:asc' },
          { label: 'Stock (High–Low)', value: 'stockQuantity:desc' },
          { label: 'SKU (A–Z)', value: 'sku:asc' },
        ]}
      />

      {items.length === 0 ? (
        <EmptyState title="No inventory items found" description="Adjust filters or create products first." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Threshold</TableHead>
                <TableHead>State</TableHead>
                {canViewCost ? <TableHead className="text-right">Unit Cost</TableHead> : null}
                {canViewCost ? <TableHead className="text-right">Stock Value</TableHead> : null}
                {canAdjust ? <TableHead className="text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`/products/${item.id}`} className="font-medium hover:underline">
                      {item.name}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{item.sku}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.category?.name ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {item.stockQuantity} {item.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {item.lowStockThreshold}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.stockState} />
                  </TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right font-mono text-xs">
                      {formatCost(item.costPrice, formatSettings)}
                    </TableCell>
                  ) : null}
                  {canViewCost ? (
                    <TableCell className="text-right font-medium">
                      {formatMoney(item.stockValue, formatSettings)}
                    </TableCell>
                  ) : null}
                  {canAdjust ? (
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openAdjust(item)}>
                        <SlidersHorizontal className="size-3.5" />
                        Adjust
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Stock Adjustment</DialogTitle>
            <DialogDescription>
              {target ? `${target.name} (${target.sku}) · Current stock: ${target.stockQuantity} ${target.unit}` : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdjust} className="space-y-4">
            <ErrorBanner message={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Direction</Label>
                <Select
                  value={direction}
                  onValueChange={(v) => setDirection(v as 'IN' | 'OUT')}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Increase (ADJUSTMENT_IN)</SelectItem>
                    <SelectItem value="OUT">Decrease (ADJUSTMENT_OUT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adj-qty">Quantity *</Label>
                <Input
                  id="adj-qty"
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as AdjustmentReason)}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="adj-notes">Notes {reason === 'OTHER' ? '*' : '(optional)'}</Label>
              <Textarea
                id="adj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explain the adjustment for the audit ledger…"
                disabled={pending}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTarget(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Recording…' : 'Record Adjustment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
