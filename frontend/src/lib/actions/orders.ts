'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { OrderDetail } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

export interface OrderLineInput {
  productId: string;
  quantity: number;
  unitPrice?: string | null;
  discountAmount?: string | null;
  taxRate?: string | null;
}

export interface OrderFormPayload {
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  notes?: string | null;
  discountType?: 'FIXED' | 'PERCENTAGE' | null;
  discountValue?: string | null;
  items: OrderLineInput[];
}

export async function createOrderAction(input: OrderFormPayload): Promise<ActionResult<OrderDetail>> {
  let created: OrderDetail;
  try {
    created = await apiFetch<OrderDetail>('/orders', {
      method: 'POST',
      body: {
        customerId: input.customerId || null,
        ...(input.customerName !== undefined ? { customerName: input.customerName || null } : {}),
        ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone || null } : {}),
        ...(input.customerAddress !== undefined ? { customerAddress: input.customerAddress || null } : {}),
        notes: input.notes || null,
        discountType: input.discountType || null,
        discountValue: input.discountType && input.discountValue ? input.discountValue : null,
        items: input.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          ...(it.unitPrice ? { unitPrice: it.unitPrice } : {}),
          ...(it.discountAmount && Number(it.discountAmount) > 0 ? { discountAmount: it.discountAmount } : {}),
          taxRate: it.taxRate === '' || it.taxRate === undefined ? null : it.taxRate,
        })),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  redirect(`/orders/${created.id}`);
}

export async function updateOrderAction(
  id: string,
  input: OrderFormPayload,
): Promise<ActionResult<OrderDetail>> {
  try {
    const updated = await apiFetch<OrderDetail>(`/orders/${id}`, {
      method: 'PATCH',
      body: {
        customerId: input.customerId || null,
        ...(input.customerName !== undefined ? { customerName: input.customerName || null } : {}),
        ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone || null } : {}),
        ...(input.customerAddress !== undefined ? { customerAddress: input.customerAddress || null } : {}),
        notes: input.notes || null,
        discountType: input.discountType || null,
        discountValue: input.discountType && input.discountValue ? input.discountValue : null,
        items: input.items.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          ...(it.unitPrice ? { unitPrice: it.unitPrice } : {}),
          ...(it.discountAmount && Number(it.discountAmount) > 0 ? { discountAmount: it.discountAmount } : {}),
          taxRate: it.taxRate === '' || it.taxRate === undefined ? null : it.taxRate,
        })),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteOrderAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/orders/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  redirect('/orders');
}

export async function confirmOrderAction(id: string): Promise<ActionResult<OrderDetail>> {
  try {
    const data = await apiFetch<OrderDetail>(`/orders/${id}/confirm`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/products');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function cancelOrderAction(
  id: string,
  reason?: string,
): Promise<ActionResult<OrderDetail>> {
  try {
    const data = await apiFetch<OrderDetail>(`/orders/${id}/cancel`, {
      method: 'POST',
      body: reason ? { reason } : {},
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/products');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function shipOrderAction(
  id: string,
  input: { carrier?: string | null; trackingNumber?: string | null },
): Promise<ActionResult<OrderDetail>> {
  try {
    const data = await apiFetch<OrderDetail>(`/orders/${id}/ship`, {
      method: 'POST',
      body: {
        carrier: input.carrier || null,
        trackingNumber: input.trackingNumber || null,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deliverOrderAction(id: string): Promise<ActionResult<OrderDetail>> {
  try {
    const data = await apiFetch<OrderDetail>(`/orders/${id}/deliver`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function completeOrderAction(id: string): Promise<ActionResult<OrderDetail>> {
  try {
    const data = await apiFetch<OrderDetail>(`/orders/${id}/complete`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/orders');
    revalidatePath(`/orders/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
