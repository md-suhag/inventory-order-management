'use server';

import { revalidatePath } from 'next/cache';
import type {
  BusinessSettings,
  DocumentSequence,
  PaymentMethod,
  Role,
  User,
} from '@/lib/api-types';
import { apiFetch, toActionError, type ActionResult } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function createUserAction(input: {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  password: string;
}): Promise<ActionResult<User>> {
  try {
    const data = await apiFetch<User>('/users', {
      method: 'POST',
      body: {
        name: input.name,
        email: input.email,
        ...(input.phone ? { phone: input.phone } : {}),
        roleId: input.roleId,
        password: input.password,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/users');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateUserAction(
  id: string,
  input: { name?: string; phone?: string | null; roleId?: string },
): Promise<ActionResult<User>> {
  try {
    const data = await apiFetch<User>(`/users/${id}`, {
      method: 'PATCH',
      body: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
        ...(input.roleId !== undefined ? { roleId: input.roleId } : {}),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/users');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function activateUserAction(id: string): Promise<ActionResult<User>> {
  try {
    const data = await apiFetch<User>(`/users/${id}/activate`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/users');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deactivateUserAction(id: string): Promise<ActionResult<User>> {
  try {
    const data = await apiFetch<User>(`/users/${id}/deactivate`, {
      method: 'POST',
      allowCookieMutation: true,
    });
    revalidatePath('/users');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function createRoleAction(input: {
  name: string;
  description?: string | null;
  permissions: string[];
}): Promise<ActionResult<Role>> {
  try {
    const data = await apiFetch<Role>('/roles', {
      method: 'POST',
      body: {
        name: input.name,
        description: input.description || null,
        permissions: input.permissions,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/roles');
    revalidatePath('/users');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateRoleAction(
  id: string,
  input: { name?: string; description?: string | null; permissions?: string[] },
): Promise<ActionResult<Role>> {
  try {
    const data = await apiFetch<Role>(`/roles/${id}`, {
      method: 'PATCH',
      body: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.permissions !== undefined ? { permissions: input.permissions } : {}),
      },
      allowCookieMutation: true,
    });
    revalidatePath('/roles');
    revalidatePath('/users');
    revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function deleteRoleAction(id: string): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>(`/roles/${id}`, {
      method: 'DELETE',
      allowCookieMutation: true,
    });
    revalidatePath('/roles');
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

// ---------------------------------------------------------------------------
// Settings, Sequences, Payment Methods
// ---------------------------------------------------------------------------

export async function updateSettingsAction(input: {
  businessName: string;
  legalName?: string | null;
  taxRegistrationNumber?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  currencyCode: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxLabel: string;
  defaultTaxRate: string;
  invoiceFooter?: string | null;
  defaultLowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  allowSelfRegistration: boolean;
}): Promise<ActionResult<BusinessSettings>> {
  try {
    const data = await apiFetch<BusinessSettings>('/settings', {
      method: 'PATCH',
      body: {
        businessName: input.businessName,
        legalName: input.legalName || null,
        taxRegistrationNumber: input.taxRegistrationNumber || null,
        email: input.email || null,
        phone: input.phone || null,
        address: input.address || null,
        currencyCode: input.currencyCode,
        locale: input.locale,
        timezone: input.timezone,
        taxEnabled: input.taxEnabled,
        taxLabel: input.taxLabel,
        defaultTaxRate: input.defaultTaxRate,
        invoiceFooter: input.invoiceFooter || null,
        defaultLowStockThreshold: input.defaultLowStockThreshold,
        lowStockAlertsEnabled: input.lowStockAlertsEnabled,
        allowSelfRegistration: input.allowSelfRegistration,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/settings');
    revalidatePath('/', 'layout');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updateSequenceAction(
  documentType: DocumentSequence['documentType'],
  input: { prefix: string; padding: number },
): Promise<ActionResult<DocumentSequence>> {
  try {
    const data = await apiFetch<DocumentSequence>(`/settings/sequences/${documentType}`, {
      method: 'PATCH',
      body: input,
      allowCookieMutation: true,
    });
    revalidatePath('/settings');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function updatePaymentMethodAction(
  id: string,
  input: { name: string; isActive: boolean; sortOrder: number },
): Promise<ActionResult<PaymentMethod>> {
  try {
    const data = await apiFetch<PaymentMethod>(`/settings/payment-methods/${id}`, {
      method: 'PATCH',
      body: input,
      allowCookieMutation: true,
    });
    revalidatePath('/settings');
    revalidatePath('/orders');
    revalidatePath('/payments');
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
