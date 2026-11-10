'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDetail, OrderListItem, ReturnCondition } from '@/lib/api-types';
import { createSalesReturnAction } from '@/lib/actions/sales-returns';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface LineSelection {
  quantity: number;
  condition: ReturnCondition;
}

export function NewReturnClient({
  eligibleOrders,
  selectedOrder,
  remainingMap,
}: {
  eligibleOrders: OrderListItem[];
  selectedOrder: OrderDetail | null;
  remainingMap: Record<string, number>;
}) {
  const router = useRouter();
  const [reason, setReason] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [selections, setSelections] = React.useState<Record<string, LineSelection>>(() => {
    const init: Record<string, LineSelection> = {};
    if (selectedOrder) {
      for (const item of selectedOrder.items) {
        init[item.id] = { quantity: 0, condition: 'RESALABLE' };
      }
    }
    return init;
  });
  const [idempotencyKey] = React.useState(() => crypto.randomUUID());
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function handleOrderPick(orderId: string) {
    router.push(`/sales-returns/new?orderId=${orderId}`);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrder) return;
    setError(null);
    if (!reason.trim()) {
      setError('Return reason is required.');
      return;
    }

    const items = Object.entries(selections)
      .filter(([, sel]) => sel.quantity > 0)
      .map(([orderItemId, sel]) => ({
        orderItemId,
        quantity: sel.quantity,
        condition: sel.condition,
      }));

    if (items.length === 0) {
      setError('Select at least one item with a return quantity greater than 0.');
      return;
    }

    startTransition(async () => {
      const res = await createSalesReturnAction(
        {
          orderId: selectedOrder.id,
          reason: reason.trim(),
          notes: notes.trim() || null,
          items,
        },
        idempotencyKey,
      );
      if (res && !res.ok) {
        setError(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Eligible Order</CardTitle>
          <CardDescription>Only DELIVERED or COMPLETED orders can have return requests.</CardDescription>
        </CardHeader>
        <CardContent>
          {eligibleOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivered or completed orders found.</p>
          ) : (
            <div className="max-w-md space-y-1.5">
              <Label>Order</Label>
              <Select value={selectedOrder?.id ?? ''} onValueChange={handleOrderPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an order…" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleOrders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.orderNumber} — {o.customerName ?? 'Walk-in'} ({o.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedOrder ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          <ErrorBanner message={error} />

          <Card>
            <CardHeader>
              <CardTitle>Return Items — {selectedOrder.orderNumber}</CardTitle>
              <CardDescription>
                Resalable items are restocked upon completion; damaged items are credited without restock.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Sold Qty</TableHead>
                    <TableHead className="text-right">Returnable</TableHead>
                    <TableHead className="w-[120px]">Return Qty</TableHead>
                    <TableHead className="w-[170px]">Condition</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.items.map((item) => {
                    const maxQty = remainingMap[item.id] ?? item.quantity;
                    const sel = selections[item.id] ?? { quantity: 0, condition: 'RESALABLE' };
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.productName}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.productSku}</div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                        <TableCell className="text-right font-mono">{maxQty}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={maxQty}
                            value={sel.quantity}
                            disabled={maxQty <= 0 || pending}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(maxQty, Number(e.target.value) || 0));
                              setSelections((prev) => ({
                                ...prev,
                                [item.id]: { ...sel, quantity: val },
                              }));
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={sel.condition}
                            disabled={maxQty <= 0 || pending}
                            onValueChange={(v) =>
                              setSelections((prev) => ({
                                ...prev,
                                [item.id]: { ...sel, condition: v as ReturnCondition },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RESALABLE">RESALABLE</SelectItem>
                              <SelectItem value="DAMAGED">DAMAGED</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ret-reason">Return Reason *</Label>
                <Input
                  id="ret-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., Damaged in transit, Wrong size"
                  disabled={pending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ret-notes">Notes</Label>
                <Textarea
                  id="ret-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={pending}
                  rows={2}
                />
              </div>
              <Button type="submit" disabled={pending}>
                {pending ? 'Submitting…' : 'Submit Return Request'}
              </Button>
            </CardContent>
          </Card>
        </form>
      ) : null}
    </div>
  );
}
