'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Plus, UserCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import type { PageMeta, Role, User } from '@/lib/api-types';
import {
  activateUserAction,
  createUserAction,
  deactivateUserAction,
  updateUserAction,
} from '@/lib/actions/admin';
import { formatDate, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorBanner } from '@/components/shared/error-banner';
import { SearchFilterBar } from '@/components/shared/search-filter-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function UsersClient({
  users,
  meta,
  roles,
  currentUserId,
  canManage,
  formatSettings,
}: {
  users: User[];
  meta: PageMeta;
  roles: Role[];
  currentUserId: string;
  canManage: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [roleId, setRoleId] = React.useState(roles[0]?.id ?? '');
  const [password, setPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [toggleTarget, setToggleTarget] = React.useState<{
    user: User;
    action: 'activate' | 'deactivate';
  } | null>(null);

  function openCreate() {
    setEditing(null);
    setName('');
    setEmail('');
    setPhone('');
    setRoleId(roles.find((r) => r.name === 'STAFF')?.id ?? roles[0]?.id ?? '');
    setPassword('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(u: User) {
    setEditing(u);
    setName(u.name);
    setEmail(u.email);
    setPhone(u.phone ?? '');
    setRoleId(u.role.id);
    setPassword('');
    setFormError(null);
    setFormOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = editing
        ? await updateUserAction(editing.id, {
            name,
            phone,
            ...(editing.id !== currentUserId ? { roleId } : {}),
          })
        : await createUserAction({
            name,
            email,
            phone: phone || undefined,
            roleId,
            password,
          });

      if (res.ok) {
        toast.success(editing ? 'User updated' : 'User created');
        setFormOpen(false);
        router.refresh();
      } else {
        setFormError(res.error.message);
      }
    });
  }

  function handleToggle() {
    if (!toggleTarget) return;
    startTransition(async () => {
      const res =
        toggleTarget.action === 'activate'
          ? await activateUserAction(toggleTarget.user.id)
          : await deactivateUserAction(toggleTarget.user.id);
      if (res.ok) {
        toast.success(
          toggleTarget.action === 'activate' ? 'User activated' : 'User deactivated and sessions revoked',
        );
        setToggleTarget(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
        setToggleTarget(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1">
          <SearchFilterBar
            searchPlaceholder="Search users by name or email…"
            filters={[
              {
                key: 'roleId',
                label: 'Role',
                type: 'select',
                options: roles.map((r) => ({ label: r.name, value: r.id })),
              },
              {
                key: 'isActive',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Active', value: 'true' },
                  { label: 'Inactive', value: 'false' },
                ],
              },
            ]}
            sortOptions={[
              { label: 'Newest First', value: 'createdAt:desc' },
              { label: 'Name (A–Z)', value: 'name:asc' },
              { label: 'Email (A–Z)', value: 'email:asc' },
              { label: 'Last Login', value: 'lastLoginAt:desc' },
            ]}
          />
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New User
          </Button>
        ) : null}
      </div>

      {users.length === 0 ? (
        <EmptyState title="No users found" description="Create users to grant team access." />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">
                        {u.name}
                        {isSelf ? (
                          <span className="ml-2 text-xs text-muted-foreground">(You)</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{u.role.name}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.phone ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={u.isActive ? 'ACTIVE' : 'INACTIVE'} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(u.lastLoginAt, formatSettings, true)}
                    </TableCell>
                    {canManage ? (
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(u)} title="Edit">
                            <Edit className="size-4" />
                          </Button>
                          {!isSelf ? (
                            u.isActive ? (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Deactivate"
                                onClick={() => setToggleTarget({ user: u, action: 'deactivate' })}
                              >
                                <UserX className="size-4 text-destructive" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                title="Activate"
                                onClick={() => setToggleTarget({ user: u, action: 'activate' })}
                              >
                                <UserCheck className="size-4 text-emerald-700" />
                              </Button>
                            )
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : 'Create User'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Changing a user role immediately revokes their active sessions.'
                : 'Creates an active account with an initial password.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="space-y-1.5">
              <Label htmlFor="usr-name">Full Name *</Label>
              <Input
                id="usr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                required
              />
            </div>

            {!editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="usr-email">Email *</Label>
                <Input
                  id="usr-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={pending}
                  required
                />
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="usr-phone">Phone</Label>
                <Input
                  id="usr-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={pending}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Role *</Label>
                <Select
                  value={roleId}
                  onValueChange={setRoleId}
                  disabled={pending || editing?.id === currentUserId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {!editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="usr-pw">Initial Password *</Label>
                <Input
                  id="usr-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={pending}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Min 8 characters, at least one letter and one digit.
                </p>
              </div>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save Changes' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toggleTarget)}
        onOpenChange={(open) => !open && setToggleTarget(null)}
        title={
          toggleTarget?.action === 'activate'
            ? `Activate ${toggleTarget.user.name}?`
            : `Deactivate ${toggleTarget?.user.name}?`
        }
        description={
          toggleTarget?.action === 'activate'
            ? 'Allows login and clears any failed-login lockout.'
            : 'Immediately revokes all sessions and blocks login.'
        }
        confirmLabel={toggleTarget?.action === 'activate' ? 'Activate' : 'Deactivate'}
        variant={toggleTarget?.action === 'activate' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleToggle}
      />
    </div>
  );
}
