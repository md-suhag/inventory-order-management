'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  CreditCard,
  Edit,
  FileText,
  PackageCheck,
  RotateCcw,
  Trash2,
  Truck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  ApiErrorDetail,
  BusinessSettings,
  Customer,
  OrderDetail,
  PaymentMethod,
  Product,
} from '@/lib/api-types';
import {
  cancelOrderAction,
  completeOrderAction,
  confirmOrderAction,
  deleteOrderAction,
  deliverOrderAction,
  shipOrderAction,
} from '@/lib/actions/orders';
import {
  recordOrderPaymentAction,
  recordOrderRefundAction,
  reversePaymentAction,
} from '@/lib/actions/payments';
import { formatDate, formatMoney } from '@/lib/format';
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
import { OrderEditor } from '../order-editor';

export function OrderDetailClient({
  order,
  customers,
  products,
  paymentMethods,
  settings,
  permissions,
}: {
  order: OrderDetail;
  customers: Customer[];
  products: Product[];
  paymentMethods: PaymentMethod[];
  settings: BusinessSettings;
  permissions: {
    canManage: boolean;
    canConfirm: boolean;
    canComplete: boolean;
    canCancelConfirmed: boolean;
    canDiscount: boolean;
    canRecordPayment: boolean;
    canRefund: boolean;
    canReverse: boolean;
    canCreateReturn: boolean;
  };
}) {
  const router = useRouter();
  const activeMethods = paymentMethods.filter((m) => m.isActive);

  const [editing, setEditing] = React.useState(false);
  const [actionError, setActionError] = React.useState<{
    message: string;
    details?: ApiErrorDetail[];
  } | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [confirmState, setConfirmState] = React.useState<
    'confirm' | 'cancel' | 'delete' | 'deliver' | 'complete' | null
  >(null);

  // Ship dialog
  const [shipOpen, setShipOpen] = React.useState(false);
  const [carrier, setCarrier] = React.useState('');
  const [trackingNumber, setTrackingNumber] = React.useState('');

  // Payment / Refund dialog
  const [payDialog, setPayDialog] = React.useState<'payment' | 'refund' | null>(null);
  const [paymentMethodId, setPaymentMethodId] = React.useState(activeMethods[0]?.id ?? '');
  const [amount, setAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [payNotes, setPayNotes] = React.useState('');
  const [payError, setPayError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState('');

  // Reverse payment dialog
  const [reverseTargetId, setReverseTargetId] = React.useState<string | null>(null);
  const [reverseKey, setReverseKey] = React.useState('');

  const netPaid = Number(order.paidAmount) - Number(order.refundedAmount);
  const effectiveTotal =
    order.status === 'CANCELLED' ? 0 : Number(order.totalAmount) - Number(order.returnedAmount);
  const refundableAmount =
    order.status === 'CANCELLED'
      ? Math.max(0, netPaid)
      : Math.max(0, netPaid - effectiveTotal);

  function openPaymentDialog(mode: 'payment' | 'refund') {
    setPayDialog(mode);
    setPaymentMethodId(activeMethods[0]?.id ?? '');
    setAmount(mode === 'payment' ? order.balanceDue : refundableAmount.toFixed(2));
    setReference('');
    setPayNotes('');
    setPayError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function handleConfirmLifecycle(reason?: string) {
    if (!confirmState) return;
    setActionError(null);
    startTransition(async () => {
      if (confirmState === 'delete') {
        const res = await deleteOrderAction(order.id);
        if (res && !res.ok) toast.error(res.error.message);
        setConfirmState(null);
        return;
      }

      const res =
        confirmState === 'confirm'
          ? await confirmOrderAction(order.id)
          : confirmState === 'cancel'
            ? await cancelOrderAction(order.id, reason)
            : confirmState === 'deliver'
              ? await deliverOrderAction(order.id)
              : await completeOrderAction(order.id);

      if (res.ok) {
        toast.success(`Order ${res.data.status.toLowerCase()}`);
        setConfirmState(null);
        router.refresh();
      } else {
        setActionError({ message: res.error.message, details: res.error.details });
        toast.error(res.error.message);
        setConfirmState(null);
      }
    });
  }

  function handleShipSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await shipOrderAction(order.id, { carrier, trackingNumber });
      if (res.ok) {
        toast.success('Order marked as shipped');
        setShipOpen(false);
        router.refresh();
      } else {
        toast.error(res.error.message);
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
          ? await recordOrderPaymentAction(
              order.id,
              { paymentMethodId, amount, reference, notes: payNotes },
              idempotencyKey,
            )
          : await recordOrderRefundAction(
              order.id,
              { paymentMethodId, amount, reference, notes: payNotes },
              idempotencyKey,
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
      const res = await reversePaymentAction(reverseTargetId, reason, reverseKey, order.id);
      if (res.ok) {
        toast.success(`Reversal ${res.data.paymentNumber} recorded`);
        setReverseTargetId(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  if (editing && order.status === 'DRAFT') {
    return (
      <OrderEditor
        customers={customers}
        products={products}
        settings={settings}
        canDiscount={permissions.canDiscount}
        existing={order}
        onCancelEdit={() => setEditing(false)}
      />
    );
  }

  const canPay =
    permissions.canRecordPayment &&
    ['CONFIRMED', 'SHIPPED', 'DELIVERED', 'COMPLETED'].includes(order.status) &&
    Number(order.balanceDue) > 0;
  const canIssueRefund = permissions.canRefund && refundableAmount > 0;
  const canCancel =
    (order.status === 'DRAFT' && permissions.canManage) ||
    (order.status === 'CONFIRMED' && permissions.canManage && permissions.canCancelConfirmed);
  const canRequestReturn =
    permissions.canCreateReturn && (order.status === 'DELIVERED' || order.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      {actionError ? <ErrorBanner message={actionError.message} details={actionError.details} /> : null}

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
          {order.invoiceNumber ? (
            <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{order.invoiceNumber}</span>
          ) : null}
          <span className="text-sm text-muted-foreground">
            Customer:{' '}
            {order.customer ? (
              <Link href={`/customers/${order.customer.id}`} className="font-medium text-foreground hover:underline">
                {order.customer.name}
              </Link>
            ) : (
              <span className="font-medium text-foreground">{order.customerName ?? 'Walk-in Customer'}</span>
            )}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status === 'DRAFT' && permissions.canManage ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Edit className="size-4" />
              Edit Draft
            </Button>
          ) : null}
          {order.status === 'DRAFT' && permissions.canConfirm ? (
            <Button size="sm" onClick={() => setConfirmState('confirm')}>
              <CheckCircle2 className="size-4" />
              Confirm Order
            </Button>
          ) : null}
          {order.status === 'CONFIRMED' && permissions.canComplete ? (
            <Button variant="outline" size="sm" onClick={() => setShipOpen(true)}>
              <Truck className="size-4" />
              Ship
            </Button>
          ) : null}
          {order.status === 'SHIPPED' && permissions.canComplete ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmState('deliver')}>
              <PackageCheck className="size-4" />
              Mark Delivered
            </Button>
          ) : null}
          {['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(order.status) && permissions.canComplete ? (
            <Button size="sm" onClick={() => setConfirmState('complete')}>
              <CheckCircle2 className="size-4" />
              Complete
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
              Issue Refund
            </Button>
          ) : null}
          {order.invoiceNumber ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/orders/${order.id}/invoice`}>
                <FileText className="size-4" />
                Invoice
              </Link>
            </Button>
          ) : null}
          {canRequestReturn ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/sales-returns/new?orderId=${order.id}`}>
                <RotateCcw className="size-4" />
                Request Return
              </Link>
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmState('cancel')}>
              <XCircle className="size-4 text-destructive" />
              Cancel Order
            </Button>
          ) : null}
          {order.status === 'DRAFT' && permissions.canManage ? (
            <Button variant="destructive" size="sm" onClick={() => setConfirmState('delete')}>
              <Trash2 className="size-4" />
              Delete Draft
            </Button>
          ) : null}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Order Total</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(order.totalAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Returned Credit</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(order.returnedAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-emerald-700">
            {formatMoney(order.paidAmount, settings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Refunded</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(order.refundedAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Balance Due</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-amber-700">
            {formatMoney(order.balanceDue, settings)}
          </CardContent>
        </Card>
      </div>

      {/* Shipping & Timeline Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Customer &amp; Fulfillment Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Name: </span>
              {order.customerName ?? 'Walk-in Customer'}
            </p>
            {order.customerPhone ? (
              <p>
                <span className="text-muted-foreground">Phone: </span>
                {order.customerPhone}
              </p>
            ) : null}
            {order.customerAddress ? (
              <p>
                <span className="text-muted-foreground">Address: </span>
                {order.customerAddress}
              </p>
            ) : null}
            {order.carrier || order.trackingNumber ? (
              <p>
                <span className="text-muted-foreground">Shipment: </span>
                {order.carrier ?? 'Carrier'} {order.trackingNumber ? `(${order.trackingNumber})` : ''}
              </p>
            ) : null}
            {order.notes ? (
              <p>
                <span className="text-muted-foreground">Notes: </span>
                {order.notes}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Lifecycle Timeline</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
            <p>Created: {formatDate(order.createdAt, settings, true)}</p>
            <p>Confirmed: {formatDate(order.confirmedAt, settings, true)}</p>
            <p>Shipped: {formatDate(order.shippedAt, settings, true)}</p>
            <p>Delivered: {formatDate(order.deliveredAt, settings, true)}</p>
            <p>Completed: {formatDate(order.completedAt, settings, true)}</p>
            <p>Cancelled: {formatDate(order.cancelledAt, settings, true)}</p>
            {order.cancellationReason ? (
              <p className="col-span-2 text-destructive">Cancel reason: {order.cancellationReason}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
          <CardDescription>
            Subtotal {formatMoney(order.subtotal, settings)} · Discount{' '}
            {formatMoney(order.discountAmount, settings)} · Tax {formatMoney(order.taxAmount, settings)}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Discounts</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item) => {
                const totalDisc = Number(item.discountAmount) + Number(item.allocatedDiscount);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">{item.lineNo}</TableCell>
                    <TableCell>
                      <Link href={`/products/${item.productId}`} className="font-medium hover:underline">
                        {item.productName}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{item.productSku}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.quantity} {item.unit}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(item.unitPrice, settings)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(totalDisc, settings)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(item.taxAmount, settings)}</TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(item.lineTotal, settings)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payments, Refunds &amp; Reversals ({order.payments.length})</CardTitle>
          <CardDescription>Append-only financial records linked to this order.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {order.payments.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
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
                {order.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs font-medium">{p.paymentNumber}</TableCell>
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
                        {p.type !== 'REVERSAL' ? (
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

      {/* Ship Modal */}
      <Dialog open={shipOpen} onOpenChange={setShipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ship Order {order.orderNumber}</DialogTitle>
            <DialogDescription>Record carrier and tracking information.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleShipSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ship-carrier">Carrier</Label>
              <Input
                id="ship-carrier"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ship-track">Tracking Number</Label>
              <Input
                id="ship-track"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                disabled={pending}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShipOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Updating…' : 'Mark Shipped'}
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
              {payDialog === 'payment' ? 'Record Customer Payment' : 'Issue Customer Refund'}
            </DialogTitle>
            <DialogDescription>
              {payDialog === 'payment'
                ? `Remaining balance due: ${formatMoney(order.balanceDue, settings)}`
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
              <Label htmlFor="pay-amount">Amount ({settings.currencyCode}) *</Label>
              <Input
                id="pay-amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-ref">Reference</Label>
              <Input
                id="pay-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Transaction / cheque reference"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-notes">Notes</Label>
              <Textarea
                id="pay-notes"
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
        open={Boolean(confirmState)}
        onOpenChange={(open) => !open && setConfirmState(null)}
        title={
          confirmState === 'confirm'
            ? `Confirm ${order.orderNumber}?`
            : confirmState === 'cancel'
              ? `Cancel ${order.orderNumber}?`
              : confirmState === 'deliver'
                ? `Mark ${order.orderNumber} Delivered?`
                : confirmState === 'complete'
                  ? `Complete ${order.orderNumber}?`
                  : `Delete ${order.orderNumber}?`
        }
        description={
          confirmState === 'confirm'
            ? 'Validates availability and atomically deducts stock for every line item, generating an invoice number.'
            : confirmState === 'cancel'
              ? order.status === 'CONFIRMED'
                ? 'Cancelling a confirmed order restores deducted stock with SALE_CANCELLATION movements.'
                : 'Cancels this draft order.'
              : confirmState === 'deliver'
                ? 'Transitions shipment to DELIVERED status (eligible for returns).'
                : confirmState === 'complete'
                  ? 'Marks this order as COMPLETED.'
                  : 'Permanently deletes this draft order.'
        }
        confirmLabel="Confirm"
        variant={confirmState === 'cancel' || confirmState === 'delete' ? 'destructive' : 'default'}
        reasonMode={confirmState === 'cancel' ? 'optional' : 'none'}
        reasonLabel="Cancellation Reason"
        loading={pending}
        onConfirm={handleConfirmLifecycle}
      />

      <ConfirmDialog
        open={Boolean(reverseTargetId)}
        onOpenChange={(open) => !open && setReverseTargetId(null)}
        title="Reverse Payment Record?"
        description="Creates an immutable REVERSAL row and adjusts order balance. This cannot be undone."
        confirmLabel="Reverse Record"
        reasonMode="required"
        reasonLabel="Reversal Reason"
        loading={pending}
        onConfirm={handleReverseSubmit}
      />
    </div>
  );
}
