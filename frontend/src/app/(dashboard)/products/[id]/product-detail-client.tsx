'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Category, ProductDetail } from '@/lib/api-types';
import {
  archiveProductAction,
  deleteProductAction,
  deleteProductImageAction,
  reorderProductImagesAction,
  unarchiveProductAction,
  updateProductAction,
} from '@/lib/actions/catalog';
import { formatBytes, formatCost, formatDate, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorBanner } from '@/components/shared/error-banner';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function ProductDetailClient({
  product,
  categories,
  canManage,
  canViewCost,
  formatSettings,
}: {
  product: ProductDetail;
  categories: Category[];
  canManage: boolean;
  canViewCost: boolean;
  formatSettings: FormatSettings;
}) {
  const router = useRouter();
  const [sku, setSku] = React.useState(product.sku);
  const [name, setName] = React.useState(product.name);
  const [barcode, setBarcode] = React.useState(product.barcode ?? '');
  const [categoryId, setCategoryId] = React.useState(product.category?.id ?? 'NONE');
  const [unit, setUnit] = React.useState(product.unit);
  const [sellingPrice, setSellingPrice] = React.useState(product.sellingPrice);
  const [costPrice, setCostPrice] = React.useState(product.costPrice ?? '');
  const [taxRate, setTaxRate] = React.useState(product.taxRate ?? '');
  const [reorderLevel, setReorderLevel] = React.useState(
    product.reorderLevel !== null ? String(product.reorderLevel) : '',
  );
  const [status, setStatus] = React.useState<'ACTIVE' | 'INACTIVE'>(
    product.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
  );
  const [description, setDescription] = React.useState(product.description ?? '');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [uploading, setUploading] = React.useState(false);

  const [confirmAction, setConfirmAction] = React.useState<'archive' | 'unarchive' | 'delete' | null>(null);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const res = await updateProductAction(product.id, {
        sku,
        name,
        sellingPrice,
        barcode: barcode || null,
        categoryId: categoryId === 'NONE' ? null : categoryId,
        unit: unit || 'pcs',
        ...(canViewCost && costPrice !== '' ? { costPrice } : {}),
        taxRate: taxRate || null,
        reorderLevel: reorderLevel !== '' ? Number(reorderLevel) : null,
        ...(product.status !== 'ARCHIVED' ? { status } : {}),
        description: description || null,
      });
      if (res.ok) {
        toast.success('Product updated');
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
          ? await archiveProductAction(product.id)
          : confirmAction === 'unarchive'
            ? await unarchiveProductAction(product.id)
            : await deleteProductAction(product.id);
      if (res.ok) {
        toast.success(
          confirmAction === 'delete'
            ? 'Product deleted'
            : confirmAction === 'archive'
              ? 'Product archived'
              : 'Product unarchived',
        );
        setConfirmAction(null);
        if (confirmAction === 'delete') {
          router.push('/products');
        } else {
          router.refresh();
        }
      } else {
        toast.error(res.error.message);
        setConfirmAction(null);
      }
    });
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append('images', file);
    }

    setUploading(true);
    try {
      const res = await fetch(`/api/products/${product.id}/images`, {
        method: 'POST',
        body: formData,
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json.error?.message ?? 'Image upload failed');
      } else {
        toast.success('Image(s) uploaded');
        router.refresh();
      }
    } catch {
      toast.error('Image upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= product.images.length) return;
    const ids = product.images.map((img) => img.id);
    const currentId = ids[index];
    const swapId = ids[target];
    if (!currentId || !swapId) return;
    ids[index] = swapId;
    ids[target] = currentId;

    startTransition(async () => {
      const res = await reorderProductImagesAction(product.id, ids);
      if (res.ok) {
        toast.success('Image order updated');
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  function handleDeleteImage(imageId: string) {
    startTransition(async () => {
      const res = await deleteProductImageAction(product.id, imageId);
      if (res.ok) {
        toast.success('Image deleted');
        router.refresh();
      } else {
        toast.error(res.error.message);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Stock & Status Overview */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Current Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold font-mono">
              {product.stockQuantity} {product.unit}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Stock changes only via movements (BR-INV-01)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Stock State</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <StatusBadge status={product.stockState} />
            <p className="text-xs text-muted-foreground">Threshold: {product.lowStockThreshold}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge status={product.status} />
          </CardContent>
        </Card>
        {canViewCost ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">WAC Unit Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono">
                {formatCost(product.costPrice, formatSettings)}
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Edit Form */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Product Details</CardTitle>
              <CardDescription>Changes never affect historical order or purchase snapshots.</CardDescription>
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                {product.status === 'ARCHIVED' ? (
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction('unarchive')}>
                    <ArchiveRestore className="size-4" />
                    Unarchive
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setConfirmAction('archive')}>
                    <Archive className="size-4" />
                    Archive
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
                  <Label htmlFor="edit-sku">SKU *</Label>
                  <Input
                    id="edit-sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    disabled={!canManage || pending}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-barcode">Barcode</Label>
                  <Input
                    id="edit-barcode"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    disabled={!canManage || pending}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canManage || pending}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId} disabled={!canManage || pending}>
                    <SelectTrigger>
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Uncategorized</SelectItem>
                      {categories.map((c) => (
                        <SelectItem
                          key={c.id}
                          value={c.id}
                          disabled={c.status === 'ARCHIVED' && c.id !== product.category?.id}
                        >
                          {c.name}
                          {c.status === 'ARCHIVED' ? ' (Archived)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-price">Selling Price *</Label>
                  <Input
                    id="edit-price"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    disabled={!canManage || pending}
                    required
                  />
                </div>
                {canViewCost ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-cost">Cost Price</Label>
                    <Input
                      id="edit-cost"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      disabled={!canManage || pending}
                    />
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-unit">Unit</Label>
                  <Input
                    id="edit-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    disabled={!canManage || pending}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-tax">Tax Rate Override (%)</Label>
                  <Input
                    id="edit-tax"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                    placeholder="Business default"
                    disabled={!canManage || pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-reorder">Reorder Level</Label>
                  <Input
                    id="edit-reorder"
                    type="number"
                    min={0}
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                    placeholder="Business default"
                    disabled={!canManage || pending}
                  />
                </div>
                {product.status !== 'ARCHIVED' ? (
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onValueChange={(v) => setStatus(v as 'ACTIVE' | 'INACTIVE')}
                      disabled={!canManage || pending}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="INACTIVE">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description</Label>
                <Textarea
                  id="edit-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canManage || pending}
                  rows={3}
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

        {/* Image Manager */}
        <Card>
          <CardHeader>
            <CardTitle>Product Images</CardTitle>
            <CardDescription>Up to 5 JPEG/PNG/WebP images (max 2 MB each). First image is primary.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManage && product.images.length < 5 ? (
              <div>
                <Label
                  htmlFor="product-image-upload"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground hover:bg-muted/40"
                >
                  <ImagePlus className="size-4" />
                  {uploading ? 'Uploading…' : `Upload images (${product.images.length}/5)`}
                </Label>
                <input
                  id="product-image-upload"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploading}
                />
              </div>
            ) : null}

            {product.images.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No images uploaded yet.</p>
            ) : (
              <div className="space-y-2.5">
                {product.images.map((img, idx) => (
                  <div key={img.id} className="flex items-center gap-3 rounded-md border p-2">
                    <img
                      src={`/api/products/${product.id}/images/${img.id}`}
                      alt={img.originalName}
                      className="size-14 rounded object-cover border shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {idx === 0 ? '★ Primary · ' : ''}
                        {img.originalName}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{formatBytes(img.sizeBytes)}</p>
                    </div>
                    {canManage ? (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={idx === 0 || pending}
                          onClick={() => moveImage(idx, -1)}
                          title="Move earlier"
                        >
                          <ArrowLeft className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          disabled={idx === product.images.length - 1 || pending}
                          onClick={() => moveImage(idx, 1)}
                          title="Move later"
                        >
                          <ArrowRight className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-destructive"
                          disabled={pending}
                          onClick={() => handleDeleteImage(img.id)}
                          title="Delete image"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Stock Movements */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Stock Movements</CardTitle>
            <CardDescription>Latest 10 immutable ledger entries for this product.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/inventory/movements?productId=${product.id}`}>Full Ledger</Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {product.recentMovements.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No movements recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Before → After</TableHead>
                  {canViewCost ? <TableHead className="text-right">Unit Cost</TableHead> : null}
                  <TableHead>Notes / Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.recentMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(m.createdAt, formatSettings, true)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.type}</TableCell>
                    <TableCell
                      className={`text-right font-mono font-medium ${
                        m.quantityChange >= 0 ? 'text-emerald-700' : 'text-red-700'
                      }`}
                    >
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {m.previousStock} → {m.resultingStock}
                    </TableCell>
                    {canViewCost ? (
                      <TableCell className="text-right font-mono text-xs">
                        {formatCost(m.unitCost, formatSettings)}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-xs text-muted-foreground">
                      {m.adjustmentReason ? `${m.adjustmentReason}: ` : ''}
                      {m.notes ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">{m.performedBy?.name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
        title={
          confirmAction === 'delete'
            ? `Delete "${product.name}"?`
            : confirmAction === 'archive'
              ? `Archive "${product.name}"?`
              : `Unarchive "${product.name}"?`
        }
        description={
          confirmAction === 'delete'
            ? 'Products with purchase lines, order lines, or inventory movements cannot be deleted — archive them instead.'
            : confirmAction === 'archive'
              ? 'Archived products cannot be added to new orders or purchases.'
              : 'Restore this product to ACTIVE status.'
        }
        confirmLabel={confirmAction === 'delete' ? 'Delete' : confirmAction === 'archive' ? 'Archive' : 'Unarchive'}
        variant={confirmAction === 'unarchive' ? 'default' : 'destructive'}
        loading={pending}
        onConfirm={handleLifecycle}
      />
    </div>
  );
}
