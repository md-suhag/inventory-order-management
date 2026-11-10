'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Edit, PackageCheck, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessSettings, Product, PurchaseDetail, Supplier } from '@/lib/api-types';
import {
  cancelPurchaseAction,
  confirmPurchaseAction,
  deletePurchaseAction,
  receiveGoodsAction,
} from '@/lib/actions/purchases';
import { formatCost, formatDate, formatMoney } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorBanner } from '@/components/shared/error-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { PurchaseEditor } from '../purchase-editor';

export function PurchaseDetailClient({
  purchase,
  suppliers,
  products,
  settings,
  permissions,
}: {
  purchase: PurchaseDetail;
  suppliers: Supplier[];
  products: Product[];
  settings: BusinessSettings;
  permissions: {
    canManage: boolean;
    canConfirm: boolean;
    canReceive: boolean;
    canCancel: boolean;
  };
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<'confirm' | 'cancel' | 'delete' | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Receive Goods modal state
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [receiveNotes, setReceiveNotes] = React.useState('');
  const [receiveQuantities, setReceiveQuantities] = React.useState<Record<string, number>>({});
  const [receiveError, setReceiveError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState('');

  function openReceiveModal() {
    const initial: Record<string, number> = {};
    for (const item of purchase.items) {
      if (item.remainingQuantity > 0) {
        initial[item.id] = item.remainingQuantity;
      }
    }
    setReceiveQuantities(initial);
    setReceiveNotes('');
    setReceiveError(null);
    setIdempotencyKey(crypto.randomUUID());
    setReceiveOpen(true);
  }

  function handleLifecycle() {
    if (!confirmAction) return;
    startTransition(async () => {
      if (confirmAction === 'delete') {
        const res = await deletePurchaseAction(purchase.id);
        if (res && !res.ok) toast.error(res.error.message);
        setConfirmAction(null);
        return;
      }
      const res =
        confirmAction === 'confirm'
          ? await confirmPurchaseAction(purchase.id)
          : await cancelPurchaseAction(purchase.id);
      if (res.ok) {
        toast.success(confirmAction === 'confirm' ? 'Purchase confirmed (ORDERED)' : 'Purchase cancelled');
        setConfirmAction(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
        setConfirmAction(null);
      }
    });
  }

  function handleReceiveSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReceiveError(null);
    const items = Object.entries(receiveQuantities)
      .filter(([, qty]) => qty > 0)
      .map(([purchaseItemId, quantity]) => ({ purchaseItemId, quantity }));

    if (items.length === 0) {
      setReceiveError('Enter a positive quantity for at least one line item.');
      return;
    }

    startTransition(async () => {
      const res = await receiveGoodsAction(
        purchase.id,
        { notes: receiveNotes || null, items },
        idempotencyKey,
      );
      if (res.ok) {
        toast.success(`Goods receipt ${res.data.receiptNumber} recorded`);
        setReceiveOpen(false);
        router.refresh();
      } else {
        setReceiveError(res.error.message);
      }
    });
  }

  if (editing && purchase.status === 'DRAFT') {
    return (
      <PurchaseEditor
        suppliers={suppliers}
        products={products}
        settings={settings}
        existing={purchase}
        onCancelEdit={() => setEditing(false)}
      />
    );
  }

  const canReceiveNow =
    permissions.canReceive &&
    (purchase.status === 'ORDERED' || purchase.status === 'PARTIALLY_RECEIVED');
  const canCancelNow =
    permissions.canCancel &&
    (purchase.status === 'DRAFT' || (purchase.status === 'ORDERED' && purchase.receipts.length === 0));

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={purchase.status} />
          <StatusBadge status={purchase.paymentStatus} />
          <span className="text-sm text-muted-foreground">
            Supplier:{' '}
            <Link href={`/suppliers/${purchase.supplier.id}`} className="font-medium text-foreground hover:underline">
              {purchase.supplier.name}
            </Link>
          </span>
          {purchase.supplierReference ? (
            <span className="text-xs text-muted-foreground">Ref: {purchase.supplierReference}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {purchase.status === 'DRAFT' && permissions.canManage ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="size-4" />
              Edit Draft
            </Button>
          ) : null}
          {purchase.status === 'DRAFT' && permissions.canConfirm ? (
            <Button size="sm" onClick={() => setConfirmAction('confirm')}>
              <CheckCircle2 className="size-4" />
              Confirm Order
            </Button>
          ) : null}
          {canReceiveNow ? (
            <Button size="sm" onClick={openReceiveModal}>
              <PackageCheck className="size-4" />
              Receive Goods
            </Button>
          ) : null}
          {canCancelNow ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmAction('cancel')}>
              <XCircle className="size-4 text-destructive" />
              Cancel
            </Button>
          ) : null}
          {purchase.status === 'DRAFT' && permissions.canManage ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmAction('delete')}>
              <Trash2 className="size-4" />
              Delete Draft
            </Button>
          ) : null}
        </div>
      </div>

      {/* Totals & Timeline */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(purchase.totalAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(purchase.paidAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Balance Due</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-amber-700">
            {formatMoney(purchase.balanceDue, settings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Dates</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-1 text-muted-foreground">
            <p>Created: {formatDate(purchase.createdAt, settings)}</p>
            {purchase.expectedDeliveryDate ? <p>Expected: {purchase.expectedDeliveryDate}</p> : null}
            {purchase.orderedAt ? <p>Ordered: {formatDate(purchase.orderedAt, settings)}</p> : null}
            {purchase.receivedAt ? <p>Received: {formatDate(purchase.receivedAt, settings)}</p> : null}
          </CardContent>
        </Card>
      </div>

      {/* Purchase Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Purchase Lines</CardTitle>
          <CardDescription>
            Subtotal {formatMoney(purchase.subtotal, settings)} · Discount{' '}
            {formatMoney(purchase.discountAmount, settings)} · Tax {formatMoney(purchase.taxAmount, settings)}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchase.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs text-muted-foreground">{item.lineNo}</TableCell>
                  <TableCell>
                    <Link href={`/products/${item.productId}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{item.productSku}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono text-emerald-700">{item.receivedQuantity}</TableCell>
                  <TableCell className="text-right font-mono">{item.remainingQuantity}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.unitCost, settings)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.taxAmount, settings)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(item.lineTotal, settings)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Goods Receipts */}
      <Card>
        <CardHeader>
          <CardTitle>Goods Receipts ({purchase.receipts.length})</CardTitle>
          <CardDescription>
            Each receipt increases product stock and blends weighted-average cost atomically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {purchase.receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goods received yet.</p>
          ) : (
            purchase.receipts.map((receipt) => (
              <div key={receipt.id} className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-sm font-semibold">{receipt.receiptNumber}</span>
                    <span className="ml-3 text-xs text-muted-foreground">
                      {formatDate(receipt.receivedAt, settings, true)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Received by {receipt.receivedBy?.name ?? 'System'}
                  </div>
                </div>
                {receipt.notes ? <p className="text-xs text-muted-foreground">Notes: {receipt.notes}</p> : null}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty Received</TableHead>
                      <TableHead className="text-right">Effective Unit Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipt.items.map((ri) => (
                      <TableRow key={ri.id}>
                        <TableCell>
                          <span className="font-medium">{ri.productName}</span>{' '}
                          <span className="font-mono text-xs text-muted-foreground">({ri.productSku})</span>
                        </TableCell>
                        <TableCell className="text-right font-mono">{ri.quantity}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCost(ri.unitCost, settings)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Receive Goods Modal */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Goods — {purchase.purchaseNumber}</DialogTitle>
            <DialogDescription>
              Specify quantities received now (supports partial receiving). Idempotency-Key attached.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReceiveSubmit} className="space-y-4">
            <ErrorBanner message={receiveError} />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead className="w-[140px]">Receive Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchase.items
                  .filter((i) => i.remainingQuantity > 0)
                  .map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.productName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{item.productSku}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.remainingQuantity}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          max={item.remainingQuantity}
                          value={receiveQuantities[item.id] ?? 0}
                          onChange={(e) => {
                            const val = Math.max(0, Math.min(item.remainingQuantity, Number(e.target.value) || 0));
                            setReceiveQuantities((prev) => ({ ...prev, [item.id]: val }));
                          }}
                          disabled={pending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>

            <div className="space-y-1.5">
              <Label htmlFor="grn-notes">Receipt Notes</Label>
              <Textarea
                id="grn-notes"
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="Delivery slip, condition notes…"
                disabled={pending}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Recording…' : 'Record Goods Receipt'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction === 'confirm'
            ? `Confirm ${purchase.purchaseNumber}?`
            : confirmAction === 'cancel'
              ? `Cancel ${purchase.purchaseNumber}?`
              : `Delete ${purchase.purchaseNumber}?`
        }
        description={
          confirmAction === 'confirm'
            ? 'Moves purchase to ORDERED and locks line prices. Physical stock increases only when goods are received.'
            : confirmAction === 'cancel'
              ? 'Marks this purchase as CANCELLED. Allowed only before any goods are received.'
              : 'Permanently deletes this draft purchase.'
        }
        confirmLabel={
          confirmAction === 'confirm' ? 'Confirm Order' : confirmAction === 'cancel' ? 'Cancel Purchase' : 'Delete'
        }
        variant={confirmAction === 'confirm' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleLifecycle}
      />
    </div>
  );
}
