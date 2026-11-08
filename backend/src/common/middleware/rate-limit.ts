import rateLimit, { type Options } from 'express-rate-limit';
import { env } from '../../config/env';
import { AppError, ErrorCode } from '../errors/app-error';

/**
 * In-memory stores (single instance — see TECHNICAL_DECISIONS TD-24).
 * Limits can be disabled via RATE_LIMIT_ENABLED=false (used by most integration tests).
 */
function limiter(windowMs: number, limit: number, message: string, overrides: Partial<Options> = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    handler: (_req, _res, next) => next(new AppError(429, ErrorCode.RATE_LIMITED, message)),
    ...overrides,
  });
}

export const globalLimiter = limiter(60_000, 300, 'Too many requests, please slow down');
export const authLimiter = limiter(60_000, 10, 'Too many authentication attempts, please try again later');
export const passwordResetLimiter = limiter(60 * 60_000, 5, 'Too many password reset requests, please try again later');
