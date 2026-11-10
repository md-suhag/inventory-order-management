const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SAFE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** Validates standard UUID route parameters before forwarding to backend endpoints. */
export function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Restricts post-login redirect targets to safe internal paths so crafted `?next=` parameters
 * cannot trigger open redirects (e.g. `//evil.com`, `/\evil.com`, or protocol-relative URLs).
 */
export function sanitizeNextPath(next?: string | null): string {
  if (!next || typeof next !== 'string') return '/';
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  // Reject ASCII control characters that browsers strip or normalize in URL bars
  if (/[\u0000-\u001f\u007f]/.test(next)) return '/';
  try {
    const parsed = new URL(next, 'http://localhost');
    if (parsed.origin !== 'http://localhost' || !parsed.pathname.startsWith('/')) {
      return '/';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/';
  }
}

export function safeImageContentType(raw: string | null): string {
  const mime = raw?.split(';')[0]?.trim().toLowerCase() ?? '';
  return SAFE_IMAGE_MIME_TYPES.has(mime) ? mime : 'application/octet-stream';
}
