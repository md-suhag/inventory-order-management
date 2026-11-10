'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { SessionResponse, TokenPair, User } from '@/lib/api-types';
import {
  apiFetch,
  clearSessionCookies,
  setSessionCookies,
  toActionError,
  type ActionResult,
} from '@/lib/api/client';
import { REFRESH_COOKIE } from '@/lib/auth/cookies';
import {
  changePasswordFormSchema,
  forgotPasswordFormSchema,
  loginFormSchema,
  registerFormSchema,
  resetPasswordFormSchema,
  updateProfileFormSchema,
} from '@/lib/schemas';

function sanitizeNextPath(next?: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export async function loginAction(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<ActionResult<void>> {
  const parsed = loginFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0] ?? 'form');
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Please check your credentials.', fieldErrors },
    };
  }

  try {
    const session = await apiFetch<SessionResponse>('/auth/login', {
      method: 'POST',
      body: parsed.data,
      skipAuth: true,
    });
    await setSessionCookies(session);
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }

  redirect(sanitizeNextPath(input.next));
}

export async function registerAction(input: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<ActionResult<{ message: string }>> {
  const parsed = registerFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0] ?? 'form');
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fieldErrors },
    };
  }

  try {
    const res = await apiFetch<{ user: User; message: string }>('/auth/register', {
      method: 'POST',
      body: {
        name: parsed.data.name,
        email: parsed.data.email,
        ...(parsed.data.phone ? { phone: parsed.data.phone } : {}),
        password: parsed.data.password,
      },
      skipAuth: true,
    });
    return { ok: true, data: { message: res.message } };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function forgotPasswordAction(input: {
  email: string;
}): Promise<ActionResult<{ message: string }>> {
  const parsed = forgotPasswordFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Invalid email address',
      },
    };
  }

  try {
    const res = await apiFetch<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: parsed.data,
      skipAuth: true,
    });
    return { ok: true, data: { message: res.message } };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function resetPasswordAction(input: {
  token: string;
  newPassword: string;
}): Promise<ActionResult<void>> {
  const parsed = resetPasswordFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0] ?? 'form');
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        fieldErrors,
      },
    };
  }

  try {
    await apiFetch<void>('/auth/reset-password', {
      method: 'POST',
      body: parsed.data,
      skipAuth: true,
    });
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }

  redirect('/login?reset=1');
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    try {
      await apiFetch<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken },
        skipAuth: true,
      });
    } catch {
      // Idempotent cookie clearing regardless of network/token expiry
    }
  }
  await clearSessionCookies();
  redirect('/login');
}

export async function logoutAllAction(): Promise<ActionResult<void>> {
  try {
    await apiFetch<void>('/auth/logout-all', {
      method: 'POST',
      allowCookieMutation: true,
    });
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  await clearSessionCookies();
  redirect('/login?loggedOutAll=1');
}

export async function updateProfileAction(input: {
  name: string;
  phone: string;
}): Promise<ActionResult<User>> {
  const parsed = updateProfileFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0] ?? 'form');
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return {
      ok: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', fieldErrors },
    };
  }

  try {
    const updated = await apiFetch<User>('/auth/me', {
      method: 'PATCH',
      body: {
        name: parsed.data.name,
        phone: parsed.data.phone === '' ? null : parsed.data.phone,
      },
      allowCookieMutation: true,
    });
    revalidatePath('/profile');
    revalidatePath('/', 'layout');
    return { ok: true, data: updated };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult<void>> {
  const parsed = changePasswordFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const f = String(issue.path[0] ?? 'form');
      if (!fieldErrors[f]) fieldErrors[f] = issue.message;
    }
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.issues[0]?.message ?? 'Validation failed',
        fieldErrors,
      },
    };
  }

  try {
    const pair = await apiFetch<TokenPair>('/auth/change-password', {
      method: 'POST',
      body: parsed.data,
      allowCookieMutation: true,
    });
    await setSessionCookies(pair);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
}
