'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Customer, PageMeta } from '@/lib/api-types';
import { createCustomerAction } from '@/lib/actions/parties';
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

export function CustomersClient({
  customers,
  meta,
  canManage,
  formatSettings,
}: {
  customers: Customer[];
  meta: PageMeta;
  canManage: boolean;
  formatSettings: FormatSettings;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [address, setAddress] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setName('');
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
      const res = await createCustomerAction({
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
        notes: notes || null,
      });
      if (res.ok) {
        toast.success(`Customer "${res.data.name}" created`);
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
            searchPlaceholder="Search customers by name, phone, or email…"
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
            New Customer
          </Button>
        ) : null}
      </div>

      {customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Create customer profiles to track orders, payments, and outstanding receivables."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? '—'}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {c.address ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(c.createdAt, formatSettings)}
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
            <DialogTitle>New Customer</DialogTitle>
            <DialogDescription>Walk-in orders do not require a saved customer record.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="space-y-1.5">
              <Label htmlFor="cust-name">Customer Name *</Label>
              <Input
                id="cust-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cust-phone">Phone</Label>
                <Input
                  id="cust-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-addr">Address</Label>
              <Textarea
                id="cust-addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={pending}
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
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
                {pending ? 'Saving…' : 'Create Customer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
