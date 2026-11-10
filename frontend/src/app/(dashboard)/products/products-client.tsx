'use client';

import * as React from 'react';
import Link from 'next/link';
import { ImageIcon, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { Category, PageMeta, Product } from '@/lib/api-types';
import { createProductAction } from '@/lib/actions/catalog';
import { formatCost, formatMoney, type FormatSettings } from '@/lib/format';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

export function ProductsClient({
  products,
  meta,
  categories,
  canManage,
  canViewCost,
  formatSettings,
}: {
  products: Product[];
  meta: PageMeta;
  categories: Category[];
  canManage: boolean;
  canViewCost: boolean;
  formatSettings: FormatSettings;
}) {
  const [createOpen, setCreateOpen] = React.useState(false);
  const [sku, setSku] = React.useState('');
  const [name, setName] = React.useState('');
  const [barcode, setBarcode] = React.useState('');
  const [categoryId, setCategoryId] = React.useState('NONE');
  const [unit, setUnit] = React.useState('pcs');
  const [sellingPrice, setSellingPrice] = React.useState('');
  const [costPrice, setCostPrice] = React.useState('');
  const [taxRate, setTaxRate] = React.useState('');
  const [reorderLevel, setReorderLevel] = React.useState('');
  const [openingStock, setOpeningStock] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  function resetForm() {
    setSku('');
    setName('');
    setBarcode('');
    setCategoryId('NONE');
    setUnit('pcs');
    setSellingPrice('');
    setCostPrice('');
    setTaxRate('');
    setReorderLevel('');
    setOpeningStock('');
    setDescription('');
    setFormError(null);
    setFieldErrors({});
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    startTransition(async () => {
      const res = await createProductAction({
        sku,
        name,
        sellingPrice,
        barcode: barcode || null,
        categoryId: categoryId === 'NONE' ? null : categoryId,
        unit: unit || 'pcs',
        ...(canViewCost && costPrice ? { costPrice } : {}),
        taxRate: taxRate || null,
        reorderLevel: reorderLevel !== '' ? Number(reorderLevel) : null,
        ...(openingStock !== '' ? { openingStock: Number(openingStock) } : {}),
        description: description || null,
      });
      if (res.ok) {
        toast.success(`Product ${res.data.sku} created`);
        setCreateOpen(false);
        resetForm();
      } else {
        setFormError(res.error.message);
        if (res.error.fieldErrors) setFieldErrors(res.error.fieldErrors);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1">
          <SearchFilterBar
            searchPlaceholder="Search by name, SKU, or barcode…"
            filters={[
              {
                key: 'categoryId',
                label: 'Category',
                type: 'select',
                options: categories.map((c) => ({ label: c.name, value: c.id })),
              },
              {
                key: 'status',
                label: 'Status',
                type: 'select',
                options: [
                  { label: 'Active', value: 'ACTIVE' },
                  { label: 'Inactive', value: 'INACTIVE' },
                  { label: 'Archived', value: 'ARCHIVED' },
                ],
              },
              {
                key: 'stockState',
                label: 'Stock',
                type: 'select',
                options: [
                  { label: 'In Stock', value: 'IN_STOCK' },
                  { label: 'Low Stock', value: 'LOW' },
                  { label: 'Out of Stock', value: 'OUT' },
                ],
              },
            ]}
            sortOptions={[
              { label: 'Name (A–Z)', value: 'name:asc' },
              { label: 'SKU (A–Z)', value: 'sku:asc' },
              { label: 'Selling Price (High–Low)', value: 'sellingPrice:desc' },
              { label: 'Stock (Low–High)', value: 'stockQuantity:asc' },
              { label: 'Newest First', value: 'createdAt:desc' },
            ]}
          />
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              resetForm();
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" />
            New Product
          </Button>
        ) : null}
      </div>

      {products.length === 0 ? (
        <EmptyState
          title="No products found"
          description="Add products to manage pricing, stock levels, purchases, and orders."
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                {canViewCost ? <TableHead className="text-right">Cost</TableHead> : null}
                <TableHead className="text-right">Selling Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead>Stock State</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/40">
                        {product.primaryImageId ? (
                          <img
                            src={`/api/products/${product.id}/images/${product.primaryImageId}`}
                            alt={product.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/products/${product.id}`}
                          className="font-medium hover:underline block truncate"
                        >
                          {product.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {product.sku}
                          {product.barcode ? ` · ${product.barcode}` : ''}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.category?.name ?? '—'}</TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right font-mono text-xs">
                      {formatCost(product.costPrice, formatSettings)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right font-medium">
                    {formatMoney(product.sellingPrice, formatSettings)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {product.stockQuantity} {product.unit}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.stockState} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={product.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DataTablePagination meta={meta} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Product</DialogTitle>
            <DialogDescription>
              SKU is automatically uppercased. Optional opening stock records an initial stock entry.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <ErrorBanner message={formError} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-sku">SKU *</Label>
                <Input
                  id="prod-sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="TEA-01"
                  disabled={pending}
                  required
                />
                {fieldErrors.sku ? <p className="text-xs text-destructive">{fieldErrors.sku}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-barcode">Barcode</Label>
                <Input
                  id="prod-barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  disabled={pending}
                />
                {fieldErrors.barcode ? (
                  <p className="text-xs text-destructive">{fieldErrors.barcode}</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prod-name">Product Name *</Label>
                <Input
                  id="prod-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={pending}
                  required
                />
                {fieldErrors.name ? <p className="text-xs text-destructive">{fieldErrors.name}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId} disabled={pending}>
                  <SelectTrigger>
                    <SelectValue placeholder="Uncategorized" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Uncategorized</SelectItem>
                    {categories
                      .filter((c) => c.status === 'ACTIVE')
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-price">Selling Price *</Label>
                <Input
                  id="prod-price"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="0.00"
                  disabled={pending}
                  required
                />
                {fieldErrors.sellingPrice ? (
                  <p className="text-xs text-destructive">{fieldErrors.sellingPrice}</p>
                ) : null}
              </div>

              {canViewCost ? (
                <div className="space-y-1.5">
                  <Label htmlFor="prod-cost">Cost Price</Label>
                  <Input
                    id="prod-cost"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    placeholder="0.0000"
                    disabled={pending}
                  />
                  {fieldErrors.costPrice ? (
                    <p className="text-xs text-destructive">{fieldErrors.costPrice}</p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label htmlFor="prod-unit">Unit</Label>
                <Input
                  id="prod-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="pcs"
                  disabled={pending}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="prod-tax">Tax Rate Override (%)</Label>
                <Input
                  id="prod-tax"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  placeholder="Default"
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-reorder">Reorder Level</Label>
                <Input
                  id="prod-reorder"
                  type="number"
                  min={0}
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  placeholder="Default"
                  disabled={pending}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-opening">Opening Stock</Label>
                <Input
                  id="prod-opening"
                  type="number"
                  min={0}
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value)}
                  placeholder="0"
                  disabled={pending}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="prod-desc">Description</Label>
              <Textarea
                id="prod-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={pending}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Creating…' : 'Create Product'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
