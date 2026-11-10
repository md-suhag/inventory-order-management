'use server';

import { revalidatePath } from 'next/cache';
import type { AdjustmentReason, InventoryMovement } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

export async function createAdjustmentAction(
  input: {
    productId: string;
    direction: 'IN' | 'OUT';
    quantity: number;
    reason: AdjustmentReason;
    notes?: string | null;
  },
  idempotencyKey: string,
): Promise<ActionResult<InventoryMovement>> {
  try {
    const data = await apiFetch<InventoryMovement>('/inventory/adjustments', {
      method: 'POST',
      body: {
        productId: input.productId,
        direction: input.direction,
        quantity: input.quantity,
        reason: input.reason,
        notes: input.notes || null,
      },
      idempotencyKey,
      allowCookieMutation: true,
    });
    revalidatePath('/inventory');
    revalidatePath('/inventory/movements');
    revalidatePath('/products');
    revalidatePath(`/products/${input.productId}`);
    revalidatePath('/');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
