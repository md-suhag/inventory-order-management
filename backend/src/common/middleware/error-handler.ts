import type { ErrorRequestHandler, RequestHandler } from 'express';
import { isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError, ErrorCode } from '../errors/app-error';
import { mapDbError } from '../errors/db-errors';

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, ErrorCode.NOT_FOUND, `Route ${req.method} ${req.path} not found`);
};

/** body-parser errors carry an HTTP status and a `type`. */
function mapBodyParserError(err: unknown): AppError | undefined {
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') return new AppError(400, ErrorCode.BAD_REQUEST, 'Malformed JSON body');
  if (e?.type === 'entity.too.large') return new AppError(413, ErrorCode.PAYLOAD_TOO_LARGE, 'Request body too large');
  if (e?.status && e.status >= 400 && e.status < 500 && e.type) {
    return new AppError(e.status, ErrorCode.BAD_REQUEST, 'Invalid request body');
  }
  return undefined;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = err instanceof AppError ? err : (mapBodyParserError(err) ?? mapDbError(err));

  if (!appError || appError.status >= 500) {
    (req.log ?? logger).error({ err, requestId: req.id }, 'unhandled error');
  }

  const status = appError?.status ?? 500;
  const body = appError
    ? { code: appError.code, message: appError.message, ...(appError.details ? { details: appError.details } : {}) }
    : {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        ...(!isProduction && err instanceof Error ? { debug: err.message } : {}),
      };

  res.status(status).json({ error: { ...body, requestId: req.id } });
};
