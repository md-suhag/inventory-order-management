'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessSettings, Product, PurchaseDetail, Supplier } from '@/lib/api-types';
import { createPurchaseAction, updatePurchaseAction } from '@/lib/actions/purchases';
import { calculateDocumentPreview, formatMoney } from '@/lib/format';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface LineDraft {
  key: string;
  productId: string;
  quantity: number;
  unitCost: string;
  discountAmount: string;
  taxRate: string;
}

export function PurchaseEditor({
  suppliers,
  products,
  settings,
  existing,
  onCancelEdit,
}: {
  suppliers: Supplier[];
  products: Product[];
  settings: BusinessSettings;
  existing?: PurchaseDetail;
  onCancelEdit?: () => void;
}) {
  const defaultTax = settings.taxEnabled ? settings.defaultTaxRate : '0';
  const activeSuppliers = suppliers.filter(
    (s) => s.status === 'ACTIVE' || s.id === existing?.supplierId,
  );
  const activeProducts = products.filter(
    (p) => p.status === 'ACTIVE' || existing?.items.some((it) => it.productId === p.id),
  );

  const [supplierId, setSupplierId] = React.useState(existing?.supplierId ?? activeSuppliers[0]?.id ?? '');
  const [supplierReference, setSupplierReference] = React.useState(existing?.supplierReference ?? '');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState(
    existing?.expectedDeliveryDate ?? '',
  );
  const [notes, setNotes] = React.useState(existing?.notes ?? '');
  const [discountType, setDiscountType] = React.useState<'NONE' | 'FIXED' | 'PERCENTAGE'>(
    existing?.discountType ?? 'NONE',
  );
  const [discountValue, setDiscountValue] = React.useState(existing?.discountValue ?? '');
  const [lines, setLines] = React.useState<LineDraft[]>(() => {
    if (existing && existing.items.length > 0) {
      return existing.items.map((it) => ({
        key: it.id,
        productId: it.productId,
        quantity: it.quantity,
        unitCost: it.unitCost,
        discountAmount: it.discountAmount,
        taxRate: it.taxRate,
      }));
    }
    const first = activeProducts[0];
    return first
      ? [
          {
            key: 'line-0',
            productId: first.id,
            quantity: 1,
            unitCost: first.costPrice ? Number(first.costPrice).toFixed(2) : '0.00',
            discountAmount: '0.00',
            taxRate: first.taxRate ?? defaultTax,
          },
        ]
      : [];
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const productMap = new Map(activeProducts.map((p) => [p.id, p]));

  function addLine() {
    const used = new Set(lines.map((l) => l.productId));
    const nextProd = activeProducts.find((p) => !used.has(p.id)) ?? activeProducts[0];
    if (!nextProd) return;
    setLines((prev) => [
      ...prev,
      {
        key: `line-${Date.now()}-${prev.length}`,
        productId: nextProd.id,
        quantity: 1,
        unitCost: nextProd.costPrice ? Number(nextProd.costPrice).toFixed(2) : '0.00',
        discountAmount: '0.00',
        taxRate: nextProd.taxRate ?? defaultTax,
      },
    ]);
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== index) return l;
        const next = { ...l, ...patch };
        if (patch.productId && patch.productId !== l.productId) {
          const prod = productMap.get(patch.productId);
          if (prod) {
            if (prod.costPrice) next.unitCost = Number(prod.costPrice).toFixed(2);
            next.taxRate = prod.taxRate ?? defaultTax;
          }
        }
        return next;
      }),
    );
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  const preview = calculateDocumentPreview(
    lines.map((l) => ({
      quantity: l.quantity,
      unitAmount: l.unitCost,
      discountAmount: l.discountAmount,
      taxRate: l.taxRate,
    })),
    discountType === 'NONE' ? null : discountType,
    discountValue,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!supplierId) {
      setError('Please select a supplier.');
      return;
    }
    if (lines.length === 0) {
      setError('Add at least one product line.');
      return;
    }

    const payload = {
      supplierId,
      supplierReference: supplierReference || null,
      expectedDeliveryDate: expectedDeliveryDate || null,
      notes: notes || null,
      discountType: discountType === 'NONE' ? null : discountType,
      discountValue: discountType === 'NONE' ? null : discountValue || '0',
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitCost: l.unitCost,
        discountAmount: l.discountAmount || '0.00',
        taxRate: l.taxRate || '0',
      })),
    };

    startTransition(async () => {
      if (existing) {
        const res = await updatePurchaseAction(existing.id, payload);
        if (res.ok) {
          toast.success('Purchase draft updated');
          onCancelEdit?.();
        } else {
          setError(res.error.message);
        }
      } else {
        const res = await createPurchaseAction(payload);
        if (res && !res.ok) {
          setError(res.error.message);
        }
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <ErrorBanner message={error} />

      <Card>
        <CardHeader>
          <CardTitle>{existing ? `Edit ${existing.purchaseNumber}` : 'Purchase Details'}</CardTitle>
          <CardDescription>
            Draft purchases do not affect stock. Totals are recalculated authoritatively on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <Select value={supplierId} onValueChange={setSupplierId} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {activeSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-ref">Supplier Reference</Label>
              <Input
                id="po-ref"
                value={supplierReference}
                onChange={(e) => setSupplierReference(e.target.value)}
                placeholder="Quote / PO ref"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="po-date">Expected Delivery</Label>
              <Input
                id="po-date"
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Header Discount</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as 'NONE' | 'FIXED' | 'PERCENTAGE')}
                disabled={pending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No Header Discount</SelectItem>
                  <SelectItem value="FIXED">Fixed Amount</SelectItem>
                  <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {discountType !== 'NONE' ? (
              <div className="space-y-1.5">
                <Label htmlFor="po-disc-val">
                  Discount {discountType === 'PERCENTAGE' ? '(%)' : `(${settings.currencyCode})`}
                </Label>
                <Input
                  id="po-disc-val"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  placeholder="0.00"
                  disabled={pending}
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="po-notes">Notes</Label>
            <Textarea
              id="po-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>Each product can appear once per purchase.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={pending}>
            <Plus className="size-4" />
            Add Line
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[220px]">Product</TableHead>
                <TableHead className="w-[100px]">Qty</TableHead>
                <TableHead className="w-[130px]">Unit Cost</TableHead>
                <TableHead className="w-[120px]">Line Disc.</TableHead>
                <TableHead className="w-[100px]">Tax %</TableHead>
                <TableHead className="text-right">Est. Total</TableHead>
                <TableHead className="w-[56px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={line.key}>
                  <TableCell>
                    <Select
                      value={line.productId}
                      onValueChange={(v) => updateLine(idx, { productId: v })}
                      disabled={pending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {activeProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.sku} — {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) => updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.unitCost}
                      onChange={(e) => updateLine(idx, { unitCost: e.target.value })}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.discountAmount}
                      onChange={(e) => updateLine(idx, { discountAmount: e.target.value })}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={line.taxRate}
                      onChange={(e) => updateLine(idx, { taxRate: e.target.value })}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatMoney(preview.lineTotals[idx] ?? '0.00', settings)}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={lines.length <= 1 || pending}
                      onClick={() => removeLine(idx)}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-lg border bg-card p-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Subtotal: </span>
            <span className="font-medium">{formatMoney(preview.subtotal, settings)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Header Discount: </span>
            <span className="font-medium">{formatMoney(preview.discountAmount, settings)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Est. Tax: </span>
            <span className="font-medium">{formatMoney(preview.taxAmount, settings)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Est. Total: </span>
            <span className="text-base font-bold">{formatMoney(preview.totalAmount, settings)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onCancelEdit ? (
            <Button type="button" variant="outline" onClick={onCancelEdit} disabled={pending}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : existing ? 'Save Draft' : 'Create Draft Purchase'}
          </Button>
        </div>
      </div>
    </form>
  );
}
