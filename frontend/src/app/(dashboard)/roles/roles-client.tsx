'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Edit, Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PageMeta, PermissionInfo, Role } from '@/lib/api-types';
import { createRoleAction, deleteRoleAction, updateRoleAction } from '@/lib/actions/admin';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { DataTablePagination } from '@/components/shared/data-table-pagination';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

export function RolesClient({
  roles,
  meta,
  catalogue,
  canManage,
}: {
  roles: Role[];
  meta: PageMeta;
  catalogue: PermissionInfo[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Role | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [selectedPerms, setSelectedPerms] = React.useState<Set<string>>(new Set());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [deleteTarget, setDeleteTarget] = React.useState<Role | null>(null);

  const groupedCatalogue = React.useMemo(() => {
    const map = new Map<string, PermissionInfo[]>();
    for (const p of catalogue) {
      const list = map.get(p.module) ?? [];
      list.push(p);
      map.set(p.module, list);
    }
    return [...map.entries()];
  }, [catalogue]);

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setSelectedPerms(new Set(['dashboard.read']));
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(role: Role) {
    setEditing(role);
    setName(role.name);
    setDescription(role.description ?? '');
    setSelectedPerms(new Set(role.permissions));
    setFormError(null);
    setFormOpen(true);
  }

  function togglePerm(key: string) {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const permissions = [...selectedPerms];
    startTransition(async () => {
      const res = editing
        ? await updateRoleAction(editing.id, {
            ...(editing.isSystem ? {} : { name }),
            description,
            permissions,
          })
        : await createRoleAction({ name, description, permissions });
      if (res.ok) {
        toast.success(editing ? 'Role updated' : 'Custom role created');
        setFormOpen(false);
        router.refresh();
      } else {
        setFormError(res.error.message);
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      const res = await deleteRoleAction(deleteTarget.id);
      if (res.ok) {
        toast.success(`Role "${deleteTarget.name}" deleted`);
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast.error(res.error.message);
        setDeleteTarget(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New Custom Role
          </Button>
        </div>
      ) : null}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Role</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Permissions</TableHead>
              <TableHead className="text-right">Users</TableHead>
              {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.map((r) => {
              const isAdmin = r.isSystem && r.name === 'ADMIN';
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {r.name}
                      {r.isSystem ? <Badge variant="outline">System</Badge> : null}
                      {isAdmin ? (
                        <Badge variant="secondary" className="gap-1">
                          <Lock className="size-3" /> Immutable
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.description ?? '—'}</TableCell>
                  <TableCell className="text-right font-mono">{r.permissions.length}</TableCell>
                  <TableCell className="text-right font-mono">{r.userCount}</TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        {!isAdmin ? (
                          <Button variant="ghost" size="icon-sm" onClick={() => openEdit(r)} title="Edit role">
                            <Edit className="size-4" />
                          </Button>
                        ) : null}
                        {!r.isSystem ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(r)}
                            title="Delete role"
                          >
                            <Trash2 className="size-4" />
                          </Button>
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

      <DataTablePagination meta={meta} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit Role: ${editing.name}` : 'Create Custom Role'}</DialogTitle>
            <DialogDescription>
              Select granular permissions for this role. Holders inherit changes on their next request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="role-name">Role Name *</Label>
                <Input
                  id="role-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending || Boolean(editing?.isSystem)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role-desc">Description</Label>
                <Textarea
                  id="role-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={pending}
                  rows={1}
                />
              </div>
            </div>

            <div className="space-y-3 max-h-[45vh] overflow-y-auto rounded-md border p-3">
              {groupedCatalogue.map(([mod, perms]) => (
                <div key={mod} className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{mod}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex items-start gap-2 rounded p-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedPerms.has(p.key)}
                          onCheckedChange={() => togglePerm(p.key)}
                          disabled={pending}
                          className="mt-0.5"
                        />
                        <div className="leading-tight">
                          <div className="font-mono text-xs font-medium">{p.key}</div>
                          <div className="text-xs text-muted-foreground">{p.description}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save Permissions' : 'Create Role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete role "${deleteTarget?.name}"?`}
        description="Custom roles can only be deleted when no users currently hold them."
        confirmLabel="Delete Role"
        loading={pending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
