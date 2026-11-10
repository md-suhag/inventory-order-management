'use server';

import { revalidatePath } from 'next/cache';
import type { PaymentDetail } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

export async function recordOrderPaymentAction(
  orderId: string,
  input: {
    paymentMethodId: string;
    amount: string;
    paidAt?: string | null;
    reference?: string | null;
    notes?: string | null;
  },
  idempotencyKey: string,
): Promise<ActionResult<PaymentDetail>> {
  try {
    const data = await apiFetch<PaymentDetail>(`/orders/${orderId}/payments`, {
      method: 'POST',
      body: {
        paymentMethodId: input.paymentMethodId,
        amount: input.amount,
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        reference: input.reference || null,
        notes: input.notes || null,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath('/orders');
    revalidatePath('/payments');
    revalidatePath('/customers');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function recordOrderRefundAction(
  orderId: string,
  input: {
    paymentMethodId: string;
    amount: string;
    salesReturnId?: string;
    paidAt?: string | null;
    reference?: string | null;
    notes?: string | null;
  },
  idempotencyKey: string,
): Promise<ActionResult<PaymentDetail>> {
  try {
    const data = await apiFetch<PaymentDetail>(`/orders/${orderId}/refunds`, {
      method: 'POST',
      body: {
        paymentMethodId: input.paymentMethodId,
        amount: input.amount,
        ...(input.salesReturnId ? { salesReturnId: input.salesReturnId } : {}),
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        reference: input.reference || null,
        notes: input.notes || null,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath('/orders');
    revalidatePath('/payments');
    revalidatePath('/sales-returns');
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function reversePaymentAction(
  paymentId: string,
  reason: string,
  idempotencyKey: string,
  orderId?: string | null,
): Promise<ActionResult<PaymentDetail>> {
  try {
    const data = await apiFetch<PaymentDetail>(`/payments/${paymentId}/reverse`, {
      method: 'POST',
      body: { reason },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath('/payments');
    revalidatePath('/orders');
    if (orderId) revalidatePath(`/orders/${orderId}`);
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
