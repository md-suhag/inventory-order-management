'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PaymentDetail, ReturnCondition, SalesReturnDetail } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

export async function createSalesReturnAction(
  input: {
    orderId: string;
    reason: string;
    notes?: string | null;
    items: { orderItemId: string; quantity: number; condition: ReturnCondition }[];
  },
  idempotencyKey: string,
): Promise<ActionResult<SalesReturnDetail>> {
  let created: SalesReturnDetail;
  try {
    created = await apiFetch<SalesReturnDetail>('/sales-returns', {
      method: 'POST',
      body: {
        orderId: input.orderId,
        reason: input.reason,
        notes: input.notes || null,
        items: input.items,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath('/sales-returns');
    revalidatePath(`/orders/${input.orderId}`);
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  redirect(`/sales-returns/${created.id}`);
}

export async function completeSalesReturnAction(
  id: string,
  notes?: string | null,
): Promise<ActionResult<SalesReturnDetail>> {
  try {
    const data = await apiFetch<SalesReturnDetail>(`/sales-returns/${id}/complete`, {
      method: 'POST',
      body: notes ? { notes } : {},
      allowCookieMutation: true,
    });
    revalidatePath('/sales-returns');
    revalidatePath(`/sales-returns/${id}`);
    revalidatePath(`/orders/${data.orderId}`);
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/products');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function rejectSalesReturnAction(
  id: string,
  reason: string,
): Promise<ActionResult<SalesReturnDetail>> {
  try {
    const data = await apiFetch<SalesReturnDetail>(`/sales-returns/${id}/reject`, {
      method: 'POST',
      body: { reason },
      allowCookieMutation: true,
    });
    revalidatePath('/sales-returns');
    revalidatePath(`/sales-returns/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function refundSalesReturnAction(
  id: string,
  input: {
    paymentMethodId: string;
    amount?: string;
    paidAt?: string | null;
    reference?: string | null;
    notes?: string | null;
  },
  idempotencyKey: string,
): Promise<ActionResult<PaymentDetail>> {
  try {
    const data = await apiFetch<PaymentDetail>(`/sales-returns/${id}/refund`, {
      method: 'POST',
      body: {
        paymentMethodId: input.paymentMethodId,
        ...(input.amount ? { amount: input.amount } : {}),
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        reference: input.reference || null,
        notes: input.notes || null,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath('/sales-returns');
    revalidatePath(`/sales-returns/${id}`);
    revalidatePath('/payments');
    revalidatePath('/orders');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
