'use server';

import { revalidatePath } from 'next/cache';
import type { Category, Product, ProductImage } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function createCategoryAction(input: {
  name: string;
  description?: string | null;
}): Promise<ActionResult<Category>> {
  try {
    const data = await apiFetch<Category>('/categories', {
      method: 'POST',
      body: {
        name: input.name,
        description: input.description || null,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateCategoryAction(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<ActionResult<Category>> {
  try {
    const data = await apiFetch<Category>(`/categories/${id}`, {
      method: 'PATCH',
      body: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? '' } : {}),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/categories');
    revalidatePath('/products');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function archiveCategoryAction(id: string): Promise<ActionResult<Category>> {
  try {
    const data = await apiFetch<Category>(`/categories/${id}/archive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/categories');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function unarchiveCategoryAction(id: string): Promise<ActionResult<Category>> {
  try {
    const data = await apiFetch<Category>(`/categories/${id}/unarchive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/categories');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteCategoryAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/categories/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/categories');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface ProductPayload {
  sku: string;
  name: string;
  sellingPrice: string;
  barcode?: string | null;
  description?: string | null;
  categoryId?: string | null;
  unit?: string;
  costPrice?: string;
  taxRate?: string | null;
  reorderLevel?: number | null;
  status?: 'ACTIVE' | 'INACTIVE';
  openingStock?: number;
}

export async function createProductAction(input: ProductPayload): Promise<ActionResult<Product>> {
  try {
    const body: Record<string, unknown> = {
      sku: input.sku,
      name: input.name,
      sellingPrice: input.sellingPrice,
      barcode: input.barcode || null,
      description: input.description || null,
      categoryId: input.categoryId || null,
      unit: input.unit || 'pcs',
      taxRate: input.taxRate === '' || input.taxRate === undefined ? null : input.taxRate,
      reorderLevel: input.reorderLevel ?? null,
      status: input.status ?? 'ACTIVE',
    };
    if (input.costPrice !== undefined && input.costPrice !== '') {
      body.costPrice = input.costPrice;
    }
    if (input.openingStock !== undefined && input.openingStock > 0) {
      body.openingStock = input.openingStock;
    }

    const data = await apiFetch<Product>('/products', {
      method: 'POST',
      body,
      allowCookieMutation: true,
    });
    revalidatePath('/products');
    revalidatePath('/inventory');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateProductAction(
  id: string,
  input: Omit<ProductPayload, 'openingStock'>,
): Promise<ActionResult<Product>> {
  try {
    const body: Record<string, unknown> = {
      sku: input.sku,
      name: input.name,
      sellingPrice: input.sellingPrice,
      barcode: input.barcode || null,
      description: input.description || null,
      categoryId: input.categoryId || null,
      unit: input.unit || 'pcs',
      taxRate: input.taxRate === '' || input.taxRate === undefined ? null : input.taxRate,
      reorderLevel: input.reorderLevel ?? null,
    };
    if (input.status) {
      body.status = input.status;
    }
    if (input.costPrice !== undefined && input.costPrice !== '') {
      body.costPrice = input.costPrice;
    }

    const data = await apiFetch<Product>(`/products/${id}`, {
      method: 'PATCH',
      body,
      allowCookieMutation: true,
    });
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    revalidatePath('/inventory');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function archiveProductAction(id: string): Promise<ActionResult<Product>> {
  try {
    const data = await apiFetch<Product>(`/products/${id}/archive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function unarchiveProductAction(id: string): Promise<ActionResult<Product>> {
  try {
    const data = await apiFetch<Product>(`/products/${id}/unarchive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/products/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/products');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function reorderProductImagesAction(
  productId: string,
  imageIds: string[],
): Promise<ActionResult<ProductImage[]>> {
  try {
    const data = await apiFetch<ProductImage[]>(`/products/${productId}/images/order`, {
      method: 'PUT',
      body: { imageIds },
      allowCookieMutation: true,
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath('/products');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteProductImageAction(
  productId: string,
  imageId: string,
): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/products/${productId}/images/${imageId}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath('/products');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
