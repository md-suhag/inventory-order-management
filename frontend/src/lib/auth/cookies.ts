import { getServerEnv } from '@/lib/env';

export const ACCESS_COOKIE = 'inv_access_token';
export const REFRESH_COOKIE = 'inv_refresh_token';

const ACCESS_MAX_AGE_DEFAULT = 15 * 60;
const REFRESH_MAX_AGE_DEFAULT = 7 * 24 * 60 * 60;

export function buildCookieOptions(maxAgeSeconds: number) {
  const env = getServerEnv();
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: env.SESSION_COOKIE_SECURE,
    maxAge: maxAgeSeconds,
  };
}

export function accessCookieOptions(expiresInSeconds?: number) {
  return buildCookieOptions(expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds : ACCESS_MAX_AGE_DEFAULT);
}

export function refreshCookieOptions(expiresAtIso?: string) {
  if (!expiresAtIso) return buildCookieOptions(REFRESH_MAX_AGE_DEFAULT);
  const diffSeconds = Math.floor((Date.parse(expiresAtIso) - Date.now()) / 1000);
  return buildCookieOptions(diffSeconds > 0 ? diffSeconds : REFRESH_MAX_AGE_DEFAULT);
}

export function clearedCookieOptions() {
  return buildCookieOptions(0);
}

/**
 * Decodes JWT `exp` without verifying the signature (signature verification is always performed
 * by the Express backend). Used only to decide whether to proactively refresh in middleware.
 */
export function getJwtExpirationMs(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded =
      typeof Buffer !== 'undefined'
        ? Buffer.from(padded, 'base64').toString('utf8')
        : atob(padded);
    const payload = JSON.parse(decoded) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isJwtExpiringSoon(token: string | undefined, bufferSeconds = 30): boolean {
  const expMs = getJwtExpirationMs(token);
  if (!expMs) return true;
  return expMs <= Date.now() + bufferSeconds * 1000;
}
