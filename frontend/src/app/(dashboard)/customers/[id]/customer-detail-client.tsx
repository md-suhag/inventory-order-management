'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerDetail, OrderListItem } from '@/lib/api-types';
import {
  archiveCustomerAction,
  deleteCustomerAction,
  unarchiveCustomerAction,
  updateCustomerAction,
} from '@/lib/actions/parties';
import { formatDate, formatMoney, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorBanner } from '@/components/shared/error-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function CustomerDetailClient({
  customer,
  orders,
  canManage,
  canArchive,
  formatSettings,
}: {
  customer: CustomerDetail;
  orders: OrderListItem[] | null;
  canManage: boolean;
  canArchive: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(customer.name);
  const [phone, setPhone] = React.useState(customer.phone ?? '');
  const [email, setEmail] = React.useState(customer.email ?? '');
  const [address, setAddress] = React.useState(customer.address ?? '');
  const [notes, setNotes] = React.useState(customer.notes ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirmAction, setConfirmAction] = React.useState<'archive' | 'unarchive' | 'delete' | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = await updateCustomerAction(customer.id, {
        name,
        phone,
        email,
        address,
        notes,
      });
      if (res.ok) {
        toast.success('Customer updated');
        router.refresh();
      } else {
        setFormError(res.error.message);
      }
    });
  }

  function handleLifecycle() {
    if (!confirmAction) return;
    startTransition(async () => {
      const res =
        confirmAction === 'archive'
          ? await archiveCustomerAction(customer.id)
          : confirmAction === 'unarchive'
            ? await unarchiveCustomerAction(customer.id)
            : await deleteCustomerAction(customer.id);
      if (res.ok) {
        toast.success(
          confirmAction === 'delete'
            ? 'Customer deleted'
            : confirmAction === 'archive'
              ? 'Customer archived'
              : 'Customer unarchived',
        );
        setConfirmAction(null);
        if (confirmAction === 'delete') router.push('/customers');
        else router.refresh();
      } else {
        toast.error(res.error.message);
        setConfirmAction(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Orders</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{customer.summary.orderCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Sales</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(customer.summary.totalSales, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Net Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(customer.summary.totalPaid, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding Receivable</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-amber-700">
            {formatMoney(customer.summary.outstandingBalance, formatSettings)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Customer Profile
              <StatusBadge status={customer.status} />
            </CardTitle>
            <CardDescription>Customer contact and billing defaults for orders.</CardDescription>
          </div>
          {canArchive ? (
            <div className="flex items-center gap-2">
              {customer.status === 'ACTIVE' ? (
                <Button variant="outline" size="sm" onClick={() => setConfirmAction('archive')}>
                  <Archive className="size-4" />
                  Archive
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setConfirmAction('unarchive')}>
                  <ArchiveRestore className="size-4" />
                  Unarchive
                </Button>
              )}
              <Button variant="destructive" size="sm" onClick={() => setConfirmAction('delete')}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-name">Name *</Label>
                <Input
                  id="cust-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManage || pending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canManage || pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canManage || pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-addr">Address</Label>
              <Textarea
                id="cust-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!canManage || pending}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canManage || pending}
                rows={2}
              />
            </div>
            {canManage ? (
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save Changes'}
              </Button>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {orders ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Order History</CardTitle>
              <CardDescription>Recent orders placed by this customer.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/orders?customerId=${customer.id}`}>View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {orders.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <Link href={`/orders/${o.id}`} className="font-mono text-xs font-medium hover:underline">
                          {o.orderNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={o.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(o.totalAmount, formatSettings)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(o.balanceDue, formatSettings)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(o.createdAt, formatSettings)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction === 'delete'
            ? `Delete "${customer.name}"?`
            : confirmAction === 'archive'
              ? `Archive "${customer.name}"?`
              : `Unarchive "${customer.name}"?`
        }
        description={
          confirmAction === 'delete'
            ? 'Customers referenced by orders cannot be deleted — archive instead.'
            : confirmAction === 'archive'
              ? 'Archived customers cannot be used on new orders.'
              : 'Restore this customer to ACTIVE status.'
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : confirmAction === 'archive' ? 'Archive' : 'Unarchive'}
        variant={confirmAction === 'unarchive' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleLifecycle}
      />
    </div>
  );
}
