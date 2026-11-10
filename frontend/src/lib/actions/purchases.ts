'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PurchaseDetail, PurchaseReceipt } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

export interface PurchaseLineInput {
  productId: string;
  quantity: number;
  unitCost: string;
  discountAmount?: string | null;
  taxRate?: string | null;
}

export interface PurchaseFormPayload {
  supplierId: string;
  supplierReference?: string | null;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  discountType?: 'FIXED' | 'PERCENTAGE' | null;
  discountValue?: string | null;
  items: PurchaseLineInput[];
}

export async function createPurchaseAction(
  input: PurchaseFormPayload,
): Promise<ActionResult<PurchaseDetail>> {
  let created: PurchaseDetail;
  try {
    created = await apiFetch<PurchaseDetail>('/purchases', {
      method: 'POST',
      body: {
        supplierId: input.supplierId,
        supplierReference: input.supplierReference || null,
        expectedDeliveryDate: input.expectedDeliveryDate || null,
        notes: input.notes || null,
        discountType: input.discountType || null,
        discountValue: input.discountType && input.discountValue ? input.discountValue : null,
        items: input.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          discountAmount: it.discountAmount || '0.00',
          taxRate: it.taxRate === '' || it.taxRate === undefined ? null : it.taxRate,
        })),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  redirect(`/purchases/${created.id}`);
}

export async function updatePurchaseAction(
  id: string,
  input: PurchaseFormPayload,
): Promise<ActionResult<PurchaseDetail>> {
  try {
    const updated = await apiFetch<PurchaseDetail>(`/purchases/${id}`, {
      method: 'PATCH',
      body: {
        supplierId: input.supplierId,
        supplierReference: input.supplierReference || null,
        expectedDeliveryDate: input.expectedDeliveryDate || null,
        notes: input.notes || null,
        discountType: input.discountType || null,
        discountValue: input.discountType && input.discountValue ? input.discountValue : null,
        items: input.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          discountAmount: it.discountAmount || '0.00',
          taxRate: it.taxRate === '' || it.taxRate === undefined ? null : it.taxRate,
        })),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deletePurchaseAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/purchases/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  redirect('/purchases');
}

export async function confirmPurchaseAction(id: string): Promise<ActionResult<PurchaseDetail>> {
  try {
    const data = await apiFetch<PurchaseDetail>(`/purchases/${id}/confirm`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelPurchaseAction(id: string): Promise<ActionResult<PurchaseDetail>> {
  try {
    const data = await apiFetch<PurchaseDetail>(`/purchases/${id}/cancel`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function receiveGoodsAction(
  id: string,
  input: {
    notes?: string | null;
    items: { purchaseItemId: string; quantity: number }[];
  },
  idempotencyKey: string,
): Promise<ActionResult<PurchaseReceipt>> {
  try {
    const data = await apiFetch<PurchaseReceipt>(`/purchases/${id}/receipts`, {
      method: 'POST',
      body: {
        notes: input.notes || null,
        items: input.items,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath('/purchases');
    revalidatePath(`/purchases/${id}`);
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/products');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
