import { describe, expect, it } from 'vitest';
import { buildCsvContent, escapeCsvCell } from '@/lib/csv';
import { isValidUuid, safeImageContentType, sanitizeNextPath } from '@/lib/security';

describe('sanitizeNextPath (open-redirect defense)', () => {
  it('allows relative internal paths with queries and hashes', () => {
    expect(sanitizeNextPath('/products')).toBe('/products');
    expect(sanitizeNextPath('/orders?status=DRAFT#items')).toBe('/orders?status=DRAFT#items');
  });

  it('rejects protocol-relative, backslash, external URLs, and control characters', () => {
    expect(sanitizeNextPath(undefined)).toBe('/');
    expect(sanitizeNextPath('')).toBe('/');
    expect(sanitizeNextPath('https://evil.example/login')).toBe('/');
    expect(sanitizeNextPath('//evil.example')).toBe('/');
    expect(sanitizeNextPath('/\\evil.example')).toBe('/');
    expect(sanitizeNextPath('/products\nSet-Cookie: a=1')).toBe('/');
  });
});

describe('UUID & MIME guards', () => {
  it('accepts standard UUIDs and rejects path traversal segments', () => {
    expect(isValidUuid('01933f10-1111-7222-8333-444455556666')).toBe(true);
    expect(isValidUuid('../roles')).toBe(false);
    expect(isValidUuid('not-a-uuid')).toBe(false);
  });

  it('restricts proxied image Content-Type to JPEG/PNG/WebP', () => {
    expect(safeImageContentType('image/png; charset=utf-8')).toBe('image/png');
    expect(safeImageContentType('image/webp')).toBe('image/webp');
    expect(safeImageContentType('image/svg+xml')).toBe('application/octet-stream');
    expect(safeImageContentType('text/html')).toBe('application/octet-stream');
  });
});

describe('CSV sanitization (CWE-1236 defense)', () => {
  it('neutralizes spreadsheet formula prefixes on strings while preserving valid signed numbers', () => {
    expect(escapeCsvCell('=CMD("calc")')).toBe("'=CMD(\"calc\")".replace(/(.+)/, (m) => `"${m.replace(/"/g, '""')}"`));
    expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(escapeCsvCell('+1+2')).toBe("'+1+2");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell(-42.5)).toBe('-42.5');
    expect(escapeCsvCell('-42.50')).toBe('-42.50');
    expect(escapeCsvCell('Widget, "Pro"')).toBe('"Widget, ""Pro"""');
  });

  it('builds CRLF-delimited CSV output cleanly', () => {
    const csv = buildCsvContent(
      [{ name: 'Tea, Green', qty: 5 }],
      [
        { header: 'Name', value: (r) => r.name },
        { header: 'Qty', value: (r) => r.qty },
      ],
    );
    expect(csv).toBe('Name,Qty\r\n"Tea, Green",5');
  });
});
