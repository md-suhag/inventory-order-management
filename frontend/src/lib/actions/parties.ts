'use server';

import { revalidatePath } from 'next/cache';
import type { Customer, Supplier } from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export interface SupplierPayload {
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createSupplierAction(input: SupplierPayload): Promise<ActionResult<Supplier>> {
  try {
    const data = await apiFetch<Supplier>('/suppliers', {
      method: 'POST',
      body: {
        name: input.name,
        contactPerson: input.contactPerson || null,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        notes: input.notes || null,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/suppliers');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateSupplierAction(
  id: string,
  input: SupplierPayload,
): Promise<ActionResult<Supplier>> {
  try {
    const data = await apiFetch<Supplier>(`/suppliers/${id}`, {
      method: 'PATCH',
      body: {
        name: input.name,
        contactPerson: input.contactPerson ?? '',
        phone: input.phone ?? '',
        email: input.email ?? '',
        address: input.address ?? '',
        notes: input.notes ?? '',
      },
      allowCookieMutation: true,
    });
    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function archiveSupplierAction(id: string): Promise<ActionResult<Supplier>> {
  try {
    const data = await apiFetch<Supplier>(`/suppliers/${id}/archive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function unarchiveSupplierAction(id: string): Promise<ActionResult<Supplier>> {
  try {
    const data = await apiFetch<Supplier>(`/suppliers/${id}/unarchive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/suppliers/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/suppliers');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerPayload {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export async function createCustomerAction(input: CustomerPayload): Promise<ActionResult<Customer>> {
  try {
    const data = await apiFetch<Customer>('/customers', {
      method: 'POST',
      body: {
        name: input.name,
        phone: input.phone || null,
        email: input.email || null,
        address: input.address || null,
        notes: input.notes || null,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/customers');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateCustomerAction(
  id: string,
  input: CustomerPayload,
): Promise<ActionResult<Customer>> {
  try {
    const data = await apiFetch<Customer>(`/customers/${id}`, {
      method: 'PATCH',
      body: {
        name: input.name,
        phone: input.phone ?? '',
        email: input.email ?? '',
        address: input.address ?? '',
        notes: input.notes ?? '',
      },
      allowCookieMutation: true,
    });
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function archiveCustomerAction(id: string): Promise<ActionResult<Customer>> {
  try {
    const data = await apiFetch<Customer>(`/customers/${id}/archive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function unarchiveCustomerAction(id: string): Promise<ActionResult<Customer>> {
  try {
    const data = await apiFetch<Customer>(`/customers/${id}/unarchive`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteCustomerAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/customers/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/customers');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
