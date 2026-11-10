'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { PageMeta, Supplier } from '@/lib/api-types';
import { createSupplierAction } from '@/lib/actions/parties';
import { formatDate, type FormatSettings } from '@/lib/format';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorBanner } from '@/components/shared/error-banner';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
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

export function SuppliersClient({
  suppliers,
  meta,
  canManage,
  formatSettings,
}: {
  suppliers: Supplier[];
  meta: PageMeta;
  canManage: boolean;
  formatSettings: FormatSettings;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [contactPerson, setContactPerson] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setName('');
    setContactPerson('');
    setPhone('');
    setEmail('');
    setAddress('');
    setNotes('');
    setFormError(null);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = await createSupplierAction({
        name,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
      });
      if (res.ok) {
        toast.success(`Supplier "${res.data.name}" created`);
        setOpen(false);
        reset();
      } else {
        setFormError(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1">
          <SearchFilterBar
            searchPlaceholder="Search suppliers by name, contact, phone, or email…"
            filters={[
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Active', value: 'ACTIVE' },
                  { label: 'Archived', value: 'ARCHIVED' },
                ],
              },
            ]}
            sortOptions={[
              { label: 'Name (A–Z)', value: 'name:asc' },
              { label: 'Name (Z–A)', value: 'name:desc' },
              { label: 'Newest First', value: 'createdAt:desc' },
            ]}
          />
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="size-4" />
            New Supplier
          </Button>
        ) : null}
      </div>

      {suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers found"
          description="Add suppliers to create purchase orders and track payables."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{s.contactPerson ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.phone ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{s.email ?? '—'}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(s.createdAt, formatSettings)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Supplier</DialogTitle>
            <DialogDescription>Add a vendor to receive purchase orders and inventory.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name">Supplier Name *</Label>
                <Input
                  id="sup-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-contact">Contact Person</Label>
                <Input
                  id="sup-contact"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-phone">Phone</Label>
                <Input
                  id="sup-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sup-email">Email</Label>
                <Input
                  id="sup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-addr">Address</Label>
              <Textarea
                id="sup-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-notes">Notes</Label>
              <Textarea
                id="sup-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Create Supplier'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
