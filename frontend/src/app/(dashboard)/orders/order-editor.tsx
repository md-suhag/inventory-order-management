'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessSettings, Customer, OrderDetail, Product } from '@/lib/api-types';
import { createOrderAction, updateOrderAction } from '@/lib/actions/orders';
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
  unitPrice: string;
  discountAmount: string;
  taxRate: string;
}

export function OrderEditor({
  customers,
  products,
  settings,
  canDiscount,
  existing,
  onCancelEdit,
}: {
  customers: Customer[];
  products: Product[];
  settings: BusinessSettings;
  canDiscount: boolean;
  existing?: OrderDetail;
  onCancelEdit?: () => void;
}) {
  const defaultTax = settings.taxEnabled ? settings.defaultTaxRate : '0';
  const activeCustomers = customers.filter(
    (c) => c.status === 'ACTIVE' || c.id === existing?.customerId,
  );
  const activeProducts = products.filter(
    (p) => p.status === 'ACTIVE' || existing?.items.some((it) => it.productId === p.id),
  );

  const [customerId, setCustomerId] = React.useState(existing?.customerId ?? 'WALK_IN');
  const [customerName, setCustomerName] = React.useState(existing?.customerName ?? '');
  const [customerPhone, setCustomerPhone] = React.useState(existing?.customerPhone ?? '');
  const [customerAddress, setCustomerAddress] = React.useState(existing?.customerAddress ?? '');
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
        unitPrice: it.unitPrice,
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
            unitPrice: Number(first.sellingPrice).toFixed(2),
            discountAmount: '0.00',
            taxRate: first.taxRate ?? defaultTax,
          },
        ]
      : [];
  });
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const productMap = new Map(activeProducts.map((p) => [p.id, p]));
  const customerMap = new Map(activeCustomers.map((c) => [c.id, c]));

  function handleCustomerChange(val: string) {
    setCustomerId(val);
    if (val === 'WALK_IN') {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
    } else {
      const c = customerMap.get(val);
      if (c) {
        setCustomerName(c.name);
        setCustomerPhone(c.phone ?? '');
        setCustomerAddress(c.address ?? '');
      }
    }
  }

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
        unitPrice: Number(nextProd.sellingPrice).toFixed(2),
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
            next.unitPrice = Number(prod.sellingPrice).toFixed(2);
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
      unitAmount: l.unitPrice,
      discountAmount: canDiscount ? l.discountAmount : '0',
      taxRate: l.taxRate,
    })),
    canDiscount && discountType !== 'NONE' ? discountType : null,
    canDiscount ? discountValue : null,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (lines.length === 0) {
      setError('Add at least one order line.');
      return;
    }

    const payload = {
      customerId: customerId === 'WALK_IN' ? null : customerId,
      customerName: customerName || null,
      customerPhone: customerPhone || null,
      customerAddress: customerAddress || null,
      notes: notes || null,
      ...(canDiscount
        ? {
            discountType: discountType === 'NONE' ? null : discountType,
            discountValue: discountType === 'NONE' ? null : discountValue || '0',
          }
        : {}),
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        ...(canDiscount ? { discountAmount: l.discountAmount || '0.00' } : {}),
        taxRate: l.taxRate || '0',
      })),
    };

    startTransition(async () => {
      if (existing) {
        const res = await updateOrderAction(existing.id, payload);
        if (res.ok) {
          toast.success('Order draft updated');
          onCancelEdit?.();
        } else {
          setError(res.error.message);
        }
      } else {
        const res = await createOrderAction(payload);
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
          <CardTitle>{existing ? `Edit ${existing.orderNumber}` : 'Order Details'}</CardTitle>
          <CardDescription>
            Draft orders do not reserve or deduct stock. Stock availability is validated atomically at
            confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={handleCustomerChange} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WALK_IN">Walk-in Customer</SelectItem>
                  {activeCustomers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-cust-name">Billing Name</Label>
              <Input
                id="ord-cust-name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Optional walk-in name"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-cust-phone">Billing Phone</Label>
              <Input
                id="ord-cust-phone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Optional phone"
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ord-cust-addr">Delivery / Billing Address</Label>
              <Textarea
                id="ord-cust-addr"
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ord-notes">Order Notes</Label>
              <Textarea
                id="ord-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
          </div>

          {canDiscount ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Order Discount</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) => setDiscountType(v as 'NONE' | 'FIXED' | 'PERCENTAGE')}
                  disabled={pending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">No Order Discount</SelectItem>
                    <SelectItem value="FIXED">Fixed Amount</SelectItem>
                    <SelectItem value="PERCENTAGE">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {discountType !== 'NONE' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ord-disc-val">
                    Discount {discountType === 'PERCENTAGE' ? '(%)' : `(${settings.currencyCode})`}
                  </Label>
                  <Input
                    id="ord-disc-val"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="0.00"
                    disabled={pending}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Order Items</CardTitle>
            <CardDescription>Current selling price and available stock are shown for reference.</CardDescription>
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
                <TableHead className="min-w-[240px]">Product</TableHead>
                <TableHead className="w-[100px]">Qty</TableHead>
                <TableHead className="w-[125px]">Unit Price</TableHead>
                {canDiscount ? <TableHead className="w-[115px]">Line Disc.</TableHead> : null}
                <TableHead className="w-[95px]">Tax %</TableHead>
                <TableHead className="text-right">Est. Total</TableHead>
                <TableHead className="w-[56px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => {
                const prod = productMap.get(line.productId);
                return (
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
                              {p.sku} — {p.name} (Stock: {p.stockQuantity})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {prod && line.quantity > prod.stockQuantity ? (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Exceeds current stock ({prod.stockQuantity} {prod.unit}) — confirmation requires
                          sufficient stock.
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                        disabled={pending}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={line.unitPrice}
                        onChange={(e) => updateLine(idx, { unitPrice: e.target.value })}
                        disabled={pending}
                      />
                    </TableCell>
                    {canDiscount ? (
                      <TableCell>
                        <Input
                          value={line.discountAmount}
                          onChange={(e) => updateLine(idx, { discountAmount: e.target.value })}
                          disabled={pending}
                        />
                      </TableCell>
                    ) : null}
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
                );
              })}
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
            <span className="text-muted-foreground">Order Discount: </span>
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
            {pending ? 'Saving…' : existing ? 'Save Draft' : 'Create Draft Order'}
          </Button>
        </div>
      </div>
    </form>
  );
}
