import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { hashPassword, passwordSchema, verifyPassword } from '../../src/common/auth/password';
import { generateOpaqueToken, hashToken, signAccessToken, verifyAccessToken } from '../../src/common/auth/tokens';

describe('password policy', () => {
  it('accepts a reasonable password', () => {
    expect(passwordSchema.safeParse('Secret123').success).toBe(true);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no digit', 'abcdefghij'],
    ['no letter', '1234567890'],
  ])('rejects %s', (_label, pwd) => {
    expect(passwordSchema.safeParse(pwd).success).toBe(false);
  });

  it('rejects passwords over 72 bytes (bcrypt limit) instead of truncating', () => {
    expect(passwordSchema.safeParse('a1' + 'x'.repeat(70)).success).toBe(true); // 72 bytes
    expect(passwordSchema.safeParse('a1' + 'x'.repeat(71)).success).toBe(false); // 73 bytes
    expect(passwordSchema.safeParse('a1' + 'é'.repeat(36)).success).toBe(false); // 74 bytes, 38 chars
  });

  it('hashes with bcrypt and verifies', async () => {
    const hash = await hashPassword('Secret123');
    expect(hash).toMatch(/^\$2[aby]\$/);
    expect(hash).not.toContain('Secret123');
    expect(await verifyPassword('Secret123', hash)).toBe(true);
    expect(await verifyPassword('Secret124', hash)).toBe(false);
  });
});

describe('access tokens', () => {
  it('round-trips subject and token version', () => {
    const { token, expiresIn } = signAccessToken('user-1', 3);
    expect(expiresIn).toBeGreaterThan(0);
    expect(verifyAccessToken(token)).toEqual({ ok: true, claims: { sub: 'user-1', tv: 3 } });
  });

  it('rejects tampered, foreign and expired tokens', () => {
    const { token } = signAccessToken('user-1', 0);
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(verifyAccessToken(tampered)).toEqual({ ok: false, reason: 'invalid' });

    const foreign = jwt.sign({ tv: 0 }, 'another-secret-that-is-long-enough-123456', { subject: 'user-1' });
    expect(verifyAccessToken(foreign)).toEqual({ ok: false, reason: 'invalid' });

    const expired = jwt.sign({ tv: 0 }, process.env.JWT_ACCESS_SECRET!, {
      subject: 'user-1',
      issuer: 'inventory-api',
      audience: 'inventory-app',
      expiresIn: -10,
    });
    expect(verifyAccessToken(expired)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects the "none" algorithm', () => {
    const unsigned = jwt.sign({ tv: 0 }, '', { algorithm: 'none', subject: 'user-1', issuer: 'inventory-api', audience: 'inventory-app' });
    expect(verifyAccessToken(unsigned).ok).toBe(false);
  });
});

describe('opaque tokens', () => {
  it('are random, URL-safe and hashed with SHA-256', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).toBe(hashToken(a));
  });
});
