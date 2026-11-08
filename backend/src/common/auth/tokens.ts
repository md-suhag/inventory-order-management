import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

const ISSUER = 'inventory-api';
const AUDIENCE = 'inventory-app';

export interface AccessTokenClaims {
  sub: string;
  /** users.token_version at issuance; a mismatch invalidates the token. */
  tv: number;
}

export function signAccessToken(userId: string, tokenVersion: number): { token: string; expiresIn: number } {
  const token = jwt.sign({ tv: tokenVersion } satisfies Omit<AccessTokenClaims, 'sub'>, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
  return { token, expiresIn: env.ACCESS_TOKEN_TTL_SECONDS };
}

export type VerifyResult = { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export function verifyAccessToken(token: string): VerifyResult {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (typeof payload === 'string' || typeof payload.sub !== 'string' || typeof payload.tv !== 'number') {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: { sub: payload.sub, tv: payload.tv } };
  } catch (err) {
    return { ok: false, reason: err instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
}

/** 256-bit random opaque token (refresh / password reset). Only its hash is stored. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
