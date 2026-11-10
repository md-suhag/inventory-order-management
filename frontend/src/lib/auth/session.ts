import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { CurrentUser, FullSettingsResponse } from '@/lib/api-types';
import { apiFetch, ApiRequestError } from '@/lib/api/client';
import { ACCESS_COOKIE } from '@/lib/auth/cookies';
import { hasPermission, hasAnyPermission, type Permission } from '@/lib/permissions';

export interface AppSession {
  user: CurrentUser;
  settings: FullSettingsResponse;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  if (!store.get(ACCESS_COOKIE)?.value) {
    return null;
  }
  try {
    return await apiFetch<CurrentUser>('/auth/me', { redirectOnUnauth: false });
  } catch (err) {
    if (
      err instanceof ApiRequestError &&
      (err.status === 401 || err.code === 'ACCOUNT_INACTIVE' || err.code === 'API_UNAVAILABLE')
    ) {
      return null;
    }
    throw err;
  }
});

export const getFullSettings = cache(async (): Promise<FullSettingsResponse> => {
  return apiFetch<FullSettingsResponse>('/settings');
});

export const requireSession = cache(async (): Promise<AppSession> => {
  const store = await cookies();
  if (!store.get(ACCESS_COOKIE)?.value) {
    redirect('/api/auth/session-expired');
  }

  let user: CurrentUser;
  try {
    user = await apiFetch<CurrentUser>('/auth/me', { redirectOnUnauth: false });
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 401 || err.code === 'ACCOUNT_INACTIVE')) {
      redirect('/api/auth/session-expired');
    }
    throw err;
  }

  const settings = await getFullSettings();
  return { user, settings };
});

export function can(user: CurrentUser, permission: Permission): boolean {
  return hasPermission(user.permissions, permission);
}

export function canAny(user: CurrentUser, permissions: readonly Permission[]): boolean {
  return hasAnyPermission(user.permissions, permissions);
}
