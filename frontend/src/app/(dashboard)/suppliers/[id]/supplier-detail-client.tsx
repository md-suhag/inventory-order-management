'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseListItem, SupplierDetail } from '@/lib/api-types';
import {
  archiveSupplierAction,
  deleteSupplierAction,
  unarchiveSupplierAction,
  updateSupplierAction,
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

export function SupplierDetailClient({
  supplier,
  purchases,
  canManage,
  formatSettings,
}: {
  supplier: SupplierDetail;
  purchases: PurchaseListItem[] | null;
  canManage: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(supplier.name);
  const [contactPerson, setContactPerson] = React.useState(supplier.contactPerson ?? '');
  const [phone, setPhone] = React.useState(supplier.phone ?? '');
  const [email, setEmail] = React.useState(supplier.email ?? '');
  const [address, setAddress] = React.useState(supplier.address ?? '');
  const [notes, setNotes] = React.useState(supplier.notes ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [confirmAction, setConfirmAction] = React.useState<'archive' | 'unarchive' | 'delete' | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = await updateSupplierAction(supplier.id, {
        name,
        contactPerson,
        phone,
        email,
        address,
        notes,
      });
      if (res.ok) {
        toast.success('Supplier updated');
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
          ? await archiveSupplierAction(supplier.id)
          : confirmAction === 'unarchive'
            ? await unarchiveSupplierAction(supplier.id)
            : await deleteSupplierAction(supplier.id);
      if (res.ok) {
        toast.success(
          confirmAction === 'delete'
            ? 'Supplier deleted'
            : confirmAction === 'archive'
              ? 'Supplier archived'
              : 'Supplier unarchived',
        );
        setConfirmAction(null);
        if (confirmAction === 'delete') router.push('/suppliers');
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
            <CardTitle className="text-xs font-medium text-muted-foreground">Active Purchases</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{supplier.summary.purchaseCount}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Purchased</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(supplier.summary.totalPurchased, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Paid</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold">
            {formatMoney(supplier.summary.totalPaid, formatSettings)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Outstanding Payable</CardTitle>
          </CardHeader>
          <CardContent className="text-xl font-bold text-amber-700">
            {formatMoney(supplier.summary.outstandingBalance, formatSettings)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Supplier Profile
              <StatusBadge status={supplier.status} />
            </CardTitle>
            <CardDescription>Contact and address details for purchase orders.</CardDescription>
          </div>
          {canManage ? (
            <div className="flex items-center gap-2">
              {supplier.status === 'ACTIVE' ? (
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name">Name *</Label>
                <Input
                  id="sup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!canManage || pending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-contact">Contact Person</Label>
                <Input
                  id="sup-contact"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  disabled={!canManage || pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone">Phone</Label>
                <Input
                  id="sup-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canManage || pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-email">Email</Label>
                <Input
                  id="sup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!canManage || pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-addr">Address</Label>
              <Textarea
                id="sup-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!canManage || pending}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-notes">Notes</Label>
              <Textarea
                id="sup-notes"
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

      {purchases ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Purchase History</CardTitle>
              <CardDescription>Recent purchases with this supplier.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/purchases?supplierId=${supplier.id}`}>View All</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {purchases.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Purchase #</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/purchases/${p.id}`} className="font-mono text-xs font-medium hover:underline">
                          {p.purchaseNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.paymentStatus} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(p.totalAmount, formatSettings)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatMoney(p.balanceDue, formatSettings)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(p.createdAt, formatSettings)}
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
            ? `Delete "${supplier.name}"?`
            : confirmAction === 'archive'
              ? `Archive "${supplier.name}"?`
              : `Unarchive "${supplier.name}"?`
        }
        description={
          confirmAction === 'delete'
            ? 'Suppliers referenced by purchases cannot be deleted — archive instead.'
            : confirmAction === 'archive'
              ? 'Archived suppliers cannot receive new purchase orders.'
              : 'Restore this supplier to ACTIVE status.'
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : confirmAction === 'archive' ? 'Archive' : 'Unarchive'}
        variant={confirmAction === 'unarchive' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleLifecycle}
      />
    </div>
  );
}
