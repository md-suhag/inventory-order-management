import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import type { OrderInvoiceDetail } from '@/lib/api-types';
import { apiFetch } from '@/lib/api/client';
import { can, requireSession } from '@/lib/auth/session';
import { formatDate, formatMoney } from '@/lib/format';
import { AccessDenied } from '@/components/shared/access-denied';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PrintInvoiceButton } from './print-invoice-button';

export const metadata: Metadata = { title: 'Invoice' };

export default async function OrderInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { user, settings } = await requireSession();
  if (!can(user, 'orders.read')) {
    return <AccessDenied />;
  }

  const { id } = await params;
  const invoice = await apiFetch<OrderInvoiceDetail>(`/orders/${id}/invoice`);
  const fmt = {
    currencyCode: invoice.business.currency,
    locale: settings.settings.locale,
    timezone: settings.settings.timezone,
  };

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button asChild variant="outline" size="sm">
          <Link href={`/orders/${id}`}>
            <ChevronLeft className="size-4" />
            Back to Order
          </Link>
        </Button>
        <PrintInvoiceButton />
      </div>

      <div className="print-only-container rounded-lg border bg-white p-8 shadow-xs space-y-8 text-slate-900">
        <div className="flex flex-col justify-between gap-6 border-b pb-6 sm:flex-row">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{invoice.business.businessName}</h1>
            {invoice.business.address ? (
              <p className="whitespace-pre-line text-sm text-slate-600">{invoice.business.address}</p>
            ) : null}
            {invoice.business.phone ? <p className="text-sm text-slate-600">{invoice.business.phone}</p> : null}
            {invoice.business.email ? <p className="text-sm text-slate-600">{invoice.business.email}</p> : null}
            {invoice.business.taxId ? (
              <p className="text-xs text-slate-500">Tax ID: {invoice.business.taxId}</p>
            ) : null}
          </div>

          <div className="text-left sm:text-right space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Invoice</p>
            <p className="text-2xl font-bold font-mono">{invoice.invoiceNumber}</p>
            <div className="flex sm:justify-end gap-2">
              <StatusBadge status={invoice.status} />
              <StatusBadge status={invoice.paymentStatus} />
            </div>
            <p className="text-xs text-slate-600">Order #: {invoice.orderNumber}</p>
            <p className="text-xs text-slate-600">Issue Date: {formatDate(invoice.issueDate, fmt)}</p>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bill To</p>
          <p className="mt-1 font-semibold">{invoice.customer.name ?? 'Walk-in Customer'}</p>
          {invoice.customer.phone ? <p className="text-sm text-slate-600">{invoice.customer.phone}</p> : null}
          {invoice.customer.address ? (
            <p className="whitespace-pre-line text-sm text-slate-600">{invoice.customer.address}</p>
          ) : null}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Item</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Tax</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item) => {
              const disc = Number(item.discountAmount) + Number(item.allocatedDiscount);
              return (
                <TableRow key={item.id}>
                  <TableCell>{item.lineNo}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.productName}</div>
                    <div className="font-mono text-xs text-slate-500">{item.productSku}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {item.quantity} {item.unit}
                  </TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.unitPrice, fmt)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(disc, fmt)}</TableCell>
                  <TableCell className="text-right font-mono">{formatMoney(item.taxAmount, fmt)}</TableCell>
                  <TableCell className="text-right font-medium">{formatMoney(item.lineTotal, fmt)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <div className="flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="font-mono">{formatMoney(invoice.subtotal, fmt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Discount</dt>
              <dd className="font-mono">-{formatMoney(invoice.discountAmount, fmt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">{invoice.business.taxLabel}</dt>
              <dd className="font-mono">{formatMoney(invoice.taxAmount, fmt)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd className="font-mono">{formatMoney(invoice.totalAmount, fmt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-600">Paid</dt>
              <dd className="font-mono">{formatMoney(invoice.paidAmount, fmt)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <dt>Balance Due</dt>
              <dd className="font-mono">{formatMoney(invoice.balanceDue, fmt)}</dd>
            </div>
          </dl>
        </div>

        {invoice.business.invoiceFooter ? (
          <div className="border-t pt-4 text-center text-xs text-slate-500">
            {invoice.business.invoiceFooter}
          </div>
        ) : null}
      </div>
    </div>
  );
}
