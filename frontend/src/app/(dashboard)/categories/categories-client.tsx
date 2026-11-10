'use client';

import * as React from 'react';
import { Archive, ArchiveRestore, Edit, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Category, PageMeta } from '@/lib/api-types';
import {
  archiveCategoryAction,
  createCategoryAction,
  deleteCategoryAction,
  unarchiveCategoryAction,
  updateCategoryAction,
} from '@/lib/actions/catalog';
import { formatDate, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
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

export function CategoriesClient({
  categories,
  meta,
  canManage,
  formatSettings,
}: {
  categories: Category[];
  meta: PageMeta;
  canManage: boolean;
  formatSettings: FormatSettings;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const [confirmTarget, setConfirmTarget] = React.useState<{
    category: Category;
    action: 'archive' | 'unarchive' | 'delete';
  } | null>(null);

  function openCreate() {
    setEditing(null);
    setName('');
    setDescription('');
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(cat: Category) {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description ?? '');
    setFormError(null);
    setFormOpen(true);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = editing
        ? await updateCategoryAction(editing.id, { name, description })
        : await createCategoryAction({ name, description });
      if (res.ok) {
        toast.success(editing ? 'Category updated' : 'Category created');
        setFormOpen(false);
      } else {
        setFormError(res.error.message);
      }
    });
  }

  function handleConfirm() {
    if (!confirmTarget) return;
    const { category, action } = confirmTarget;
    startTransition(async () => {
      const res =
        action === 'archive'
          ? await archiveCategoryAction(category.id)
          : action === 'unarchive'
            ? await unarchiveCategoryAction(category.id)
            : await deleteCategoryAction(category.id);
      if (res.ok) {
        toast.success(
          action === 'delete'
            ? 'Category deleted'
            : action === 'archive'
              ? 'Category archived'
              : 'Category unarchived',
        );
        setConfirmTarget(null);
      } else {
        toast.error(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1">
          <SearchFilterBar
            searchPlaceholder="Search categories by name or description…"
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
              { label: 'Most Products', value: 'productCount:desc' },
              { label: 'Newest First', value: 'createdAt:desc' },
            ]}
          />
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New Category
          </Button>
        ) : null}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          title="No categories found"
          description="Create categories to organize products and filter reports."
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="size-4" />
                Create Category
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Products</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    {cat.description ?? '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">{cat.productCount}</TableCell>
                  <TableCell>
                    <StatusBadge status={cat.status} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(cat.updatedAt, formatSettings)}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(cat)} title="Edit">
                          <Edit className="size-4" />
                        </Button>
                        {cat.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setConfirmTarget({ category: cat, action: 'archive' })}
                            title="Archive"
                          >
                            <Archive className="size-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setConfirmTarget({ category: cat, action: 'unarchive' })}
                            title="Unarchive"
                          >
                            <ArchiveRestore className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmTarget({ category: cat, action: 'delete' })}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Rename or update category details.' : 'Category names must be unique.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <ErrorBanner message={formError} />
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : editing ? 'Save Changes' : 'Create Category'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmTarget)}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        title={
          confirmTarget?.action === 'delete'
            ? `Delete "${confirmTarget.category.name}"?`
            : confirmTarget?.action === 'archive'
              ? `Archive "${confirmTarget.category.name}"?`
              : `Unarchive "${confirmTarget?.category.name}"?`
        }
        description={
          confirmTarget?.action === 'delete'
            ? 'Categories with linked products cannot be deleted — archive them instead.'
            : confirmTarget?.action === 'archive'
              ? 'Archived categories cannot be assigned to new products, while existing product links remain intact.'
              : 'Make this category active and assignable to products again.'
        }
        confirmLabel={
          confirmTarget?.action === 'delete'
            ? 'Delete'
            : confirmTarget?.action === 'archive'
              ? 'Archive'
              : 'Unarchive'
        }
        variant={confirmTarget?.action === 'unarchive' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
