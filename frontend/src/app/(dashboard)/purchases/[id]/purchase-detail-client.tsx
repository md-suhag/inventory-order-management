'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, Edit, PackageCheck, Trash2, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessSettings, PaymentDetail, PaymentMethod, Product, PurchaseDetail, Supplier } from '@/lib/api-types';
import {
  cancelPurchaseAction,
  confirmPurchaseAction,
  deletePurchaseAction,
  receiveGoodsAction,
} from '@/lib/actions/purchases';
import {
  recordPurchasePaymentAction,
  recordPurchaseRefundAction,
  reversePaymentAction,
} from '@/lib/actions/payments';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { PurchaseEditor } from '../purchase-editor';

export function PurchaseDetailClient({
  purchase,
  payments,
  paymentMethods,
  suppliers,
  products,
  settings,
  permissions,
}: {
  purchase: PurchaseDetail;
  payments: PaymentDetail[];
  paymentMethods: PaymentMethod[];
  suppliers: Supplier[];
  products: Product[];
  settings: BusinessSettings;
  permissions: {
    canManage: boolean;
    canConfirm: boolean;
    canReceive: boolean;
    canCancel: boolean;
    canViewPayments: boolean;
    canRecordPayment: boolean;
    canRefund: boolean;
    canReverse: boolean;
  };
}) {
  const router = useRouter();
  const activeMethods = paymentMethods.filter((m) => m.isActive);
  const [editing, setEditing] = React.useState(false);
  const [confirmAction, setConfirmAction] = React.useState<'confirm' | 'cancel' | 'delete' | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Receive Goods modal state
  const [receiveOpen, setReceiveOpen] = React.useState(false);
  const [receiveNotes, setReceiveNotes] = React.useState('');
  const [receiveQuantities, setReceiveQuantities] = React.useState<Record<string, number>>({});
  const [receiveError, setReceiveError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState('');

  // Payment / Refund modal state
  const [payDialog, setPayDialog] = React.useState<'payment' | 'refund' | null>(null);
  const [paymentMethodId, setPaymentMethodId] = React.useState(activeMethods[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [payNotes, setPayNotes] = React.useState('');
  const [payError, setPayError] = React.useState<string | null>(null);
  const [payKey, setPayKey] = React.useState('');

  // Reverse dialog state
  const [reverseTargetId, setReverseTargetId] = React.useState<string | null>(null);
  const [reverseKey, setReverseKey] = React.useState('');

  const netPaid = Number(purchase.paidAmount) - Number(purchase.refundedAmount);
  const effectiveTotal = purchase.status === 'CANCELLED' ? 0 : Number(purchase.totalAmount);
  const refundableAmount =
    purchase.status === 'CANCELLED' ? Math.max(0, netPaid) : Math.max(0, netPaid - effectiveTotal);

  function openPaymentDialog(mode: 'payment' | 'refund') {
    setPayDialog(mode);
    setPaymentMethodId(activeMethods[0]?.id ?? '');
    setAmount(mode === 'payment' ? purchase.balanceDue : refundableAmount.toFixed(2));
    setReference('');
    setPayNotes('');
    setPayError(null);
    setPayKey(crypto.randomUUID());
  }

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

  function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!payDialog) return;
    setPayError(null);
    startTransition(async () => {
      const res =
        payDialog === 'payment'
          ? await recordPurchasePaymentAction(
              purchase.id,
              { paymentMethodId, amount, reference, notes: payNotes },
              payKey,
            )
          : await recordPurchaseRefundAction(
              purchase.id,
              { paymentMethodId, amount, reference, notes: payNotes },
              payKey,
            );
      if (res.ok) {
        toast.success(`${payDialog === 'payment' ? 'Payment' : 'Refund'} ${res.data.paymentNumber} recorded`);
        setPayDialog(null);
        router.refresh();
      } else {
        setPayError(res.error.message);
      }
    });
  }

  function handleReverseSubmit(reason?: string) {
    if (!reverseTargetId || !reason) return;
    startTransition(async () => {
      const res = await reversePaymentAction(reverseTargetId, reason, reverseKey, null, purchase.id);
      if (res.ok) {
        toast.success(`Reversal ${res.data.paymentNumber} recorded`);
        setReverseTargetId(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
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
  const canPay =
    permissions.canRecordPayment &&
    ['ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(purchase.status) &&
    Number(purchase.balanceDue) > 0;
  const canIssueRefund = permissions.canRefund && refundableAmount > 0;
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
          {canPay ? (
            <Button size="sm" variant="secondary" onClick={() => openPaymentDialog('payment')}>
              <CreditCard className="size-4" />
              Record Payment
            </Button>
          ) : null}
          {canIssueRefund ? (
            <Button size="sm" variant="outline" onClick={() => openPaymentDialog('refund')}>
              <Undo2 className="size-4" />
              Record Refund
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
          <CardContent>
            <div className="text-xl font-bold">{formatMoney(netPaid.toFixed(2), settings)}</div>
            {Number(purchase.refundedAmount) > 0 ? (
              <p className="text-xs text-muted-foreground">
                Refunded: {formatMoney(purchase.refundedAmount, settings)}
              </p>
            ) : null}
          </CardContent>
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

      {/* Supplier Payments & Refunds */}
      {permissions.canViewPayments ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments, Refunds &amp; Reversals ({payments.length})</CardTitle>
            <CardDescription>Append-only supplier financial records linked to this purchase.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No supplier payments recorded yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {permissions.canReverse ? <TableHead className="text-right">Action</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        {p.paymentNumber}
                        {p.reversedBy ? (
                          <div className="text-[11px] font-normal text-destructive">
                            Reversed by {p.reversedBy.paymentNumber}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.type} />
                      </TableCell>
                      <TableCell>{p.paymentMethod.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(p.paidAt, settings, true)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(p.amount, settings)}</TableCell>
                      {permissions.canReverse ? (
                        <TableCell className="text-right">
                          {p.type !== 'REVERSAL' && !p.reversedBy ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setReverseTargetId(p.id);
                                setReverseKey(crypto.randomUUID());
                              }}
                            >
                              Reverse
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Receive Goods Modal */}
      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive Goods — {purchase.purchaseNumber}</DialogTitle>
            <DialogDescription>
              Specify quantities received now (partial or full receiving).
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

      {/* Payment / Refund Modal */}
      <Dialog open={Boolean(payDialog)} onOpenChange={(open) => !open && setPayDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {payDialog === 'payment' ? 'Record Supplier Payment' : 'Record Supplier Refund'}
            </DialogTitle>
            <DialogDescription>
              {payDialog === 'payment'
                ? `Remaining balance due: ${formatMoney(purchase.balanceDue, settings)}`
                : `Maximum refundable: ${formatMoney(refundableAmount.toFixed(2), settings)}`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePaymentSubmit} className="space-y-4">
            <ErrorBanner message={payError} />
            <div className="space-y-1.5">
              <Label>Payment Method *</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId} disabled={pending}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  {activeMethods.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-pay-amount">Amount ({settings.currencyCode}) *</Label>
              <Input
                id="sup-pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-pay-ref">Reference</Label>
              <Input
                id="sup-pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transfer / cheque / receipt reference"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-pay-notes">Notes</Label>
              <Textarea
                id="sup-pay-notes"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPayDialog(null)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? 'Saving…'
                  : payDialog === 'payment'
                    ? 'Record Payment'
                    : 'Record Refund'}
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

      <ConfirmDialog
        open={Boolean(reverseTargetId)}
        onOpenChange={(open) => !open && setReverseTargetId(null)}
        title="Reverse Supplier Payment Record?"
        description="Reverses this payment record and updates the purchase balance. This cannot be undone."
        confirmLabel="Reverse Record"
        reasonMode="required"
        reasonLabel="Reversal Reason"
        loading={pending}
        onConfirm={handleReverseSubmit}
      />
    </div>
  );
}
