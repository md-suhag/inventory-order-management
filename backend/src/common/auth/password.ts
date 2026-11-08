import bcrypt from 'bcrypt';
import { z } from 'zod';
import { env } from '../../config/env';

/** bcrypt only uses the first 72 bytes of input; longer passwords are rejected rather than truncated. */
export const BCRYPT_MAX_BYTES = 72;

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((v) => Buffer.byteLength(v, 'utf8') <= BCRYPT_MAX_BYTES, 'Password must be at most 72 bytes')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain at least one letter and one digit');

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hash of a random value, compared against when the user does not exist so that
 * "unknown email" and "wrong password" take the same time.
 */
let dummyHash: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash('dummy-password-for-timing-equalisation', env.BCRYPT_ROUNDS);
  return dummyHash;
}
