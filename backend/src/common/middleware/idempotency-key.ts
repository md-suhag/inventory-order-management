import type { RequestHandler } from 'express';
import { AppError, ErrorCode } from '../errors/app-error';

const VALID_KEY = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Requires an `Idempotency-Key` header (8–100 chars, URL-safe; a UUID is recommended).
 * The service stores the key on the row it creates under a UNIQUE constraint and replays
 * the original result on retry (BUSINESS_RULES BR-IDEM-01).
 */
export const requireIdempotencyKey: RequestHandler = (req, _res, next) => {
  const key = req.get('idempotency-key');
  if (!key || !VALID_KEY.test(key)) {
    throw new AppError(
      400,
      ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      'A valid Idempotency-Key header (8-100 characters: letters, digits, "-" or "_") is required',
    );
  }
  req.idempotencyKey = key;
  next();
};
