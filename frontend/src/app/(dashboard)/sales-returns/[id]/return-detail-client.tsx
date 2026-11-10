'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CreditCard, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { BusinessSettings, PaymentMethod, SalesReturnDetail } from '@/lib/api-types';
import {
  completeSalesReturnAction,
  refundSalesReturnAction,
  rejectSalesReturnAction,
} from '@/lib/actions/sales-returns';
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

export function ReturnDetailClient({
  salesReturn,
  paymentMethods,
  settings,
  canProcess,
  canRefund,
}: {
  salesReturn: SalesReturnDetail;
  paymentMethods: PaymentMethod[];
  settings: BusinessSettings;
  canProcess: boolean;
  canRefund: boolean;
}) {
  const router = useRouter();
  const activeMethods = paymentMethods.filter((m) => m.isActive);

  const [actionMode, setActionMode] = React.useState<'complete' | 'reject' | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [refundOpen, setRefundOpen] = React.useState(false);
  const [paymentMethodId, setPaymentMethodId] = React.useState(activeMethods[0]?.id ?? '');
  const [refundAmount, setRefundAmount] = React.useState('');
  const [reference, setReference] = React.useState('');
  const [refundNotes, setRefundNotes] = React.useState('');
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState('');

  const alreadyRefunded = salesReturn.refunds.reduce((sum, r) => sum + Number(r.amount), 0);
  const netPaidOnOrder = Number(salesReturn.order.paidAmount) - Number(salesReturn.order.refundedAmount);
  const remainingReturnCredit = Math.max(0, Number(salesReturn.totalAmount) - alreadyRefunded);
  const maxRefundable = Math.min(remainingReturnCredit, Math.max(0, netPaidOnOrder));

  function openRefundModal() {
    setPaymentMethodId(activeMethods[0]?.id ?? '');
    setRefundAmount(maxRefundable.toFixed(2));
    setReference('');
    setRefundNotes('');
    setRefundError(null);
    setIdempotencyKey(crypto.randomUUID());
    setRefundOpen(true);
  }

  function handleProcess(reasonOrNotes?: string) {
    if (!actionMode) return;
    startTransition(async () => {
      if (actionMode === 'complete') {
        const res = await completeSalesReturnAction(salesReturn.id, reasonOrNotes);
        if (res.ok) {
          toast.success('Sales return completed');
          setActionMode(null);
          router.refresh();
        } else {
          toast.error(res.error.message);
        }
      } else if (reasonOrNotes) {
        const res = await rejectSalesReturnAction(salesReturn.id, reasonOrNotes);
        if (res.ok) {
          toast.success('Sales return rejected');
          setActionMode(null);
          router.refresh();
        } else {
          toast.error(res.error.message);
        }
      }
    });
  }

  function handleRefundSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRefundError(null);
    startTransition(async () => {
      const res = await refundSalesReturnAction(
        salesReturn.id,
        {
          paymentMethodId,
          amount: refundAmount || undefined,
          reference: reference || null,
          notes: refundNotes || null,
        },
        idempotencyKey,
      );
      if (res.ok) {
        toast.success(`Refund ${res.data.paymentNumber} issued`);
        setRefundOpen(false);
        router.refresh();
      } else {
        setRefundError(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={salesReturn.status} />
          <span className="text-sm text-muted-foreground">
            Order:{' '}
            <Link
              href={`/orders/${salesReturn.orderId}`}
              className="font-mono font-medium text-foreground hover:underline"
            >
              {salesReturn.orderNumber}
            </Link>
          </span>
          {salesReturn.order.customer ? (
            <span className="text-sm text-muted-foreground">· {salesReturn.order.customer.name}</span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {salesReturn.status === 'PENDING' && canProcess ? (
            <>
              <Button size="sm" onClick={() => setActionMode('complete')}>
                <CheckCircle2 className="size-4" />
                Approve &amp; Complete
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setActionMode('reject')}>
                <XCircle className="size-4" />
                Reject
              </Button>
            </>
          ) : null}
          {salesReturn.status === 'COMPLETED' && canRefund && maxRefundable > 0 ? (
            <Button size="sm" variant="secondary" onClick={openRefundModal}>
              <CreditCard className="size-4" />
              Issue Refund
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Credit Subtotal</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(salesReturn.subtotal, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Credit Tax</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(salesReturn.taxAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Credit</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">{formatMoney(salesReturn.totalAmount, settings)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Refunded</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-emerald-700">
            {formatMoney(alreadyRefunded.toFixed(2), settings)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Return Details</CardTitle>
          <CardDescription>
            Requested {formatDate(salesReturn.createdAt, settings, true)} by{' '}
            {salesReturn.requestedBy?.name ?? 'User'}
            {salesReturn.processedAt
              ? ` · Processed ${formatDate(salesReturn.processedAt, settings, true)} by ${
                  salesReturn.processedBy?.name ?? 'User'
                }`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Reason: </span>
            {salesReturn.reason}
          </p>
          {salesReturn.notes ? (
            <p>
              <span className="text-muted-foreground">Notes: </span>
              {salesReturn.notes}
            </p>
          ) : null}
          {salesReturn.rejectionReason ? (
            <p className="text-destructive">
              <span className="font-medium">Rejection Reason: </span>
              {salesReturn.rejectionReason}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Returned Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Condition</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesReturn.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`/products/${item.productId}`} className="font-medium hover:underline">
                      {item.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{item.productSku}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={item.condition} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.quantity} {item.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.subtotal, settings)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.taxAmount, settings)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(item.totalAmount, settings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Refund Payments ({salesReturn.refunds.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {salesReturn.refunds.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No refunds issued for this return.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment #</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Paid At</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesReturn.refunds.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.paymentNumber}</TableCell>
                      <TableCell>{r.paymentMethod.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(r.paidAt, settings, true)}
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatMoney(r.amount, settings)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Restock Movements ({salesReturn.inventoryMovements.length})</CardTitle>
            <CardDescription>Created only for RESALABLE items upon return completion.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {salesReturn.inventoryMovements.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No restock movements recorded.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty Added</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesReturn.inventoryMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.type}</TableCell>
                      <TableCell className="text-right font-mono text-emerald-700">+{m.quantityChange}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(m.createdAt, settings, true)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Issue Refund Modal */}
      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Issue Return Refund — {salesReturn.returnNumber}</DialogTitle>
            <DialogDescription>
              Maximum refundable for this return: {formatMoney(maxRefundable.toFixed(2), settings)}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRefundSubmit} className="space-y-4">
            <ErrorBanner message={refundError} />
            <div className="space-y-1.5">
              <Label>Payment Method *</Label>
              <Select value={paymentMethodId} onValueChange={setPaymentMethodId} disabled={pending}>
                <SelectTrigger>
                  <SelectValue />
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
              <Label htmlFor="ret-refund-amt">Amount ({settings.currencyCode}) *</Label>
              <Input
                id="ret-refund-amt"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-refund-ref">Reference</Label>
              <Input
                id="ret-refund-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-refund-notes">Notes</Label>
              <Textarea
                id="ret-refund-notes"
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRefundOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Refunding…' : 'Issue Refund'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(actionMode)}
        onOpenChange={(open) => !open && setActionMode(null)}
        title={
          actionMode === 'complete'
            ? `Complete ${salesReturn.returnNumber}?`
            : `Reject ${salesReturn.returnNumber}?`
        }
        description={
          actionMode === 'complete'
            ? 'Restocks RESALABLE lines via SALE_RETURN movements and updates the order returned credit.'
            : 'Rejects this return request with a mandatory reason.'
        }
        confirmLabel={actionMode === 'complete' ? 'Complete Return' : 'Reject Return'}
        variant={actionMode === 'complete' ? 'default' : 'destructive'}
        reasonMode={actionMode === 'reject' ? 'required' : 'optional'}
        reasonLabel={actionMode === 'reject' ? 'Rejection Reason' : 'Processing Notes'}
        loading={pending}
        onConfirm={handleProcess}
      />
    </div>
  );
}
