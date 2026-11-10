import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ApiErrorDetail, ApiErrorPayload, PageMeta, TokenPair } from '@/lib/api-types';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearedCookieOptions,
  refreshCookieOptions,
} from '@/lib/auth/cookies';
import { getServerEnv } from '@/lib/env';

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ApiErrorDetail[],
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export interface ActionError {
  code: string;
  message: string;
  details?: ApiErrorDetail[];
  fieldErrors?: Record<string, string>;
}

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function toActionError(err: unknown): ActionError {
  if (err instanceof ApiRequestError) {
    const fieldErrors: Record<string, string> = {};
    if (err.details) {
      for (const d of err.details) {
        if (d.field && !fieldErrors[d.field]) {
          fieldErrors[d.field] = d.message;
        }
      }
    }
    return {
      code: err.code,
      message: err.message,
      details: err.details,
      fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: err instanceof Error ? err.message : 'An unexpected error occurred',
  };
}

const inflightRefreshes = new Map<string, Promise<TokenPair | null>>();

export async function refreshTokenPair(refreshToken: string): Promise<TokenPair | null> {
  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const { API_BASE_URL } = getServerEnv();
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: TokenPair };
      return json.data ?? null;
    } catch {
      return null;
    } finally {
      inflightRefreshes.delete(refreshToken);
    }
  })();

  inflightRefreshes.set(refreshToken, promise);
  return promise;
}

export async function setSessionCookies(pair: TokenPair): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, pair.accessToken, accessCookieOptions(pair.accessTokenExpiresIn));
  store.set(REFRESH_COOKIE, pair.refreshToken, refreshCookieOptions(pair.refreshTokenExpiresAt));
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, '', clearedCookieOptions());
  store.set(REFRESH_COOKIE, '', clearedCookieOptions());
}

function buildError(status: number, bodyText: string): ApiRequestError {
  try {
    const parsed = JSON.parse(bodyText) as { error?: ApiErrorPayload };
    if (parsed?.error) {
      return new ApiRequestError(
        status,
        parsed.error.code || 'INTERNAL_ERROR',
        parsed.error.message || `Request failed (${status})`,
        parsed.error.details,
        parsed.error.requestId,
      );
    }
  } catch {
    // Non-JSON response
  }
  return new ApiRequestError(status, 'INTERNAL_ERROR', `Request failed with status ${status}`);
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  /** True in Server Actions & Route Handlers where cookies() can be mutated on 401 refresh. */
  allowCookieMutation?: boolean;
  /** True for public auth endpoints that do not require session cookies. */
  skipAuth?: boolean;
  /** Redirect path if unauthenticated in Server Components. */
  redirectOnUnauth?: boolean;
}

export function buildQueryString(
  query?: Record<string, string | number | boolean | undefined | null>,
): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

async function rawRequest(
  path: string,
  options: ApiFetchOptions,
  accessToken: string | undefined,
): Promise<Response> {
  const { API_BASE_URL } = getServerEnv();
  const qs = buildQueryString(options.query);
  const url = `${API_BASE_URL}${path}${qs}`;
  const headers: Record<string, string> = {};

  if (!options.skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    console.error('[bff-api] Request failed:', url, err);
    throw new ApiRequestError(
      503,
      'API_UNAVAILABLE',
      'Service is temporarily unavailable. Please try again in a moment.',
    );
  }
}

export async function apiFetchEnvelope<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ data: T; meta?: PageMeta }> {
  const store = options.skipAuth ? null : await cookies();
  let accessToken = store?.get(ACCESS_COOKIE)?.value;
  const refreshToken = store?.get(REFRESH_COOKIE)?.value;

  let res = await rawRequest(path, options, accessToken);

  if (res.status === 401 && !options.skipAuth && options.allowCookieMutation && refreshToken) {
    const pair = await refreshTokenPair(refreshToken);
    if (pair) {
      await setSessionCookies(pair);
      accessToken = pair.accessToken;
      res = await rawRequest(path, options, accessToken);
    } else {
      await clearSessionCookies();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    const err = buildError(res.status, text);

    if (
      options.redirectOnUnauth !== false &&
      !options.skipAuth &&
      (res.status === 401 || err.code === 'ACCOUNT_INACTIVE')
    ) {
      if (options.allowCookieMutation) {
        await clearSessionCookies();
        redirect('/login');
      } else {
        redirect('/api/auth/session-expired');
      }
    }

    throw err;
  }

  if (res.status === 204) {
    return { data: undefined as T };
  }

  return (await res.json()) as { data: T; meta?: PageMeta };
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const envelope = await apiFetchEnvelope<T>(path, options);
  return envelope.data;
}

export async function apiFetchPage<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ data: T[]; meta: PageMeta }> {
  const envelope = await apiFetchEnvelope<T[]>(path, options);
  return {
    data: envelope.data,
    meta: envelope.meta ?? { page: 1, pageSize: 20, total: envelope.data.length, totalPages: 1 },
  };
}
