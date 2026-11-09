/**
 * Stable, machine-readable error codes. Clients branch on `code`, never on `message`.
 * Keep in sync with docs/api/API_DESIGN.md §Errors.
 */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  FORBIDDEN: 'FORBIDDEN',
  REGISTRATION_DISABLED: 'REGISTRATION_DISABLED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE: 'DUPLICATE',
  REFERENCED: 'REFERENCED',
  INVALID_REFERENCE: 'INVALID_REFERENCE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',
  IDEMPOTENCY_KEY_REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  TRANSACTION_CONFLICT: 'TRANSACTION_CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorDetail {
  field?: string;
  message: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new AppError(400, ErrorCode.BAD_REQUEST, message, details);
export const validationError = (details: ErrorDetail[], message = 'Request validation failed') =>
  new AppError(422, ErrorCode.VALIDATION_ERROR, message, details);
export const unauthenticated = (message = 'Authentication required', code: ErrorCode = ErrorCode.UNAUTHENTICATED) =>
  new AppError(401, code, message);
export const forbidden = (message = 'You do not have permission to perform this action', code: ErrorCode = ErrorCode.FORBIDDEN) =>
  new AppError(403, code, message);
export const notFound = (entity = 'Resource') => new AppError(404, ErrorCode.NOT_FOUND, `${entity} not found`);
export const conflict = (message: string, code: ErrorCode = ErrorCode.CONFLICT, details?: ErrorDetail[]) =>
  new AppError(409, code, message, details);
export const businessRule = (message: string, details?: ErrorDetail[]) =>
  new AppError(422, ErrorCode.BUSINESS_RULE_VIOLATION, message, details);
/** A referenced id in the request body does not exist (e.g. unknown roleId). */
export const invalidReference = (field: string, message = 'Referenced record does not exist') =>
  new AppError(422, ErrorCode.INVALID_REFERENCE, message, [{ field, message }]);
