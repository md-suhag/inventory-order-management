'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PageMeta, PaymentDetail, PaymentMethod } from '@/lib/api-types';
import { reversePaymentAction } from '@/lib/actions/payments';
import { formatDate, formatMoney, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function PaymentsClient({
  payments,
  meta,
  paymentMethods,
  canReverse,
  formatSettings,
}: {
  payments: PaymentDetail[];
  meta: PageMeta;
  paymentMethods: PaymentMethod[];
  canReverse: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<PaymentDetail | null>(null);
  const [reverseTarget, setReverseTarget] = React.useState<PaymentDetail | null>(null);
  const [reverseKey, setReverseKey] = React.useState('');
  const [pending, startTransition] = React.useTransition();

  function handleReverse(reason?: string) {
    if (!reverseTarget || !reason) return;
    startTransition(async () => {
      const res = await reversePaymentAction(
        reverseTarget.id,
        reason,
        reverseKey,
        reverseTarget.orderId,
        reverseTarget.purchaseId,
      );
      if (res.ok) {
        toast.success(`Reversal ${res.data.paymentNumber} created`);
        setReverseTarget(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <SearchFilterBar
        hideSearch
        filters={[
          {
            key: 'type',
            label: 'Type',
            type: 'select',
            options: [
              { label: 'Payment', value: 'PAYMENT' },
              { label: 'Refund', value: 'REFUND' },
              { label: 'Reversal', value: 'REVERSAL' },
            ],
          },
          {
            key: 'paymentMethodId',
            label: 'Method',
            type: 'select',
            options: paymentMethods.map((m) => ({ label: m.name, value: m.id })),
          },
          { key: 'from', label: 'From', type: 'date' },
          { key: 'to', label: 'To', type: 'date' },
        ]}
        sortOptions={[
          { label: 'Newest First', value: 'createdAt:desc' },
          { label: 'Paid Date (Desc)', value: 'paidAt:desc' },
          { label: 'Amount (High–Low)', value: 'amount:desc' },
          { label: 'Payment # (Desc)', value: 'paymentNumber:desc' },
        ]}
      />

      {payments.length === 0 ? (
        <EmptyState
          title="No payment records found"
          description="Customer payments, refunds, and reversals appear here."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Paid At</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold">
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
                  <TableCell className="text-xs">
                    {p.orderId ? (
                      <Link href={`/orders/${p.orderId}`} className="text-primary hover:underline">
                        Order
                      </Link>
                    ) : p.purchaseId ? (
                      <Link href={`/purchases/${p.purchaseId}`} className="text-primary hover:underline">
                        Purchase
                      </Link>
                    ) : (
                      '—'
                    )}
                    {p.salesReturnId ? (
                      <>
                        {' · '}
                        <Link href={`/sales-returns/${p.salesReturnId}`} className="text-primary hover:underline">
                          Return
                        </Link>
                      </>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.reference ?? '—'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(p.paidAt, formatSettings, true)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatMoney(p.amount, formatSettings)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon-sm" onClick={() => setSelected(p)} title="Details">
                        <Eye className="size-4" />
                      </Button>
                      {canReverse && p.type !== 'REVERSAL' && !p.reversedBy ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Reverse"
                          onClick={() => {
                            setReverseTarget(p);
                            setReverseKey(crypto.randomUUID());
                          }}
                        >
                          <Undo2 className="size-4 text-destructive" />
                        </Button>
                      ) : null}
                    </div>
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
            <DialogTitle>{selected?.paymentNumber}</DialogTitle>
            <DialogDescription>Immutable payment ledger entry.</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Type</dt>
                <dd>
                  <StatusBadge status={selected.type} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Amount</dt>
                <dd className="font-semibold">{formatMoney(selected.amount, formatSettings)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Method</dt>
                <dd>{selected.paymentMethod.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Paid At</dt>
                <dd>{formatDate(selected.paidAt, formatSettings, true)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Recorded By</dt>
                <dd>{selected.recordedBy?.name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reference</dt>
                <dd>{selected.reference ?? '—'}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="text-muted-foreground">{selected.notes ?? '—'}</dd>
              </div>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(reverseTarget)}
        onOpenChange={(open) => !open && setReverseTarget(null)}
        title={`Reverse ${reverseTarget?.paymentNumber}?`}
        description="Records a reversal entry and updates the linked document balance. This cannot be undone."
        confirmLabel="Reverse Payment"
        reasonMode="required"
        reasonLabel="Reversal Reason"
        loading={pending}
        onConfirm={handleReverse}
      />
    </div>
  );
}
