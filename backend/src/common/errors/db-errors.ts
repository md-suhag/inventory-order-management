import { Prisma } from '@prisma/client';
import { AppError, ErrorCode } from './app-error';

/** PostgreSQL SQLSTATE codes we care about. */
export const PgCode = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  RESTRICT_VIOLATION: '23001', // raised by the append-only ledger triggers
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK_DETECTED: '40P01',
  LOCK_NOT_AVAILABLE: '55P03',
} as const;

/** Best-effort extraction of the PostgreSQL SQLSTATE from any Prisma error shape. */
export function getPgCode(err: unknown): string | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const metaCode = (err.meta as { code?: unknown } | undefined)?.code;
    if (typeof metaCode === 'string' && /^[0-9A-Z]{5}$/.test(metaCode)) return metaCode;
    if (err.code === 'P2002') return PgCode.UNIQUE_VIOLATION;
    if (err.code === 'P2003') return PgCode.FOREIGN_KEY_VIOLATION;
    if (err.code === 'P2034') return PgCode.SERIALIZATION_FAILURE;
  }
  if (err instanceof Error) {
    const m = /(?:Code: `|SQLSTATE\s*\(?)([0-9A-Z]{5})/.exec(err.message);
    if (m) return m[1];
    if (/violates check constraint/i.test(err.message)) return PgCode.CHECK_VIOLATION;
    if (/deadlock detected/i.test(err.message)) return PgCode.DEADLOCK_DETECTED;
  }
  return undefined;
}

/** Errors worth retrying the whole transaction for. */
export function isRetryableTransactionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') return true;
  const code = getPgCode(err);
  return code === PgCode.SERIALIZATION_FAILURE || code === PgCode.DEADLOCK_DETECTED;
}

export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (getPgCode(err) !== PgCode.UNIQUE_VIOLATION) return false;
  if (!field) return true;
  const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
  return Array.isArray(target)
    ? target.some((t) => String(t).includes(field))
    : String(target ?? '').includes(field);
}

/**
 * Translate database errors that escaped the service layer into API errors.
 * Services should catch expected cases themselves and throw specific AppErrors;
 * this mapping is the safety net.
 */
export function mapDbError(err: unknown): AppError | undefined {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    return new AppError(404, ErrorCode.NOT_FOUND, 'Resource not found');
  }
  const code = getPgCode(err);
  switch (code) {
    case PgCode.UNIQUE_VIOLATION: {
      const target = (err as Prisma.PrismaClientKnownRequestError).meta?.target;
      const fields = Array.isArray(target) ? target.map(String) : [];
      return new AppError(
        409,
        ErrorCode.DUPLICATE,
        fields.length ? `A record with this ${fields.join(', ')} already exists` : 'Duplicate record',
        fields.map((f) => ({ field: f, message: 'Must be unique' })),
      );
    }
    case PgCode.FOREIGN_KEY_VIOLATION:
      return new AppError(409, ErrorCode.REFERENCED, 'Operation violates a reference to another record');
    case PgCode.CHECK_VIOLATION:
      return new AppError(422, ErrorCode.BUSINESS_RULE_VIOLATION, 'Operation violates a data integrity rule');
    case PgCode.RESTRICT_VIOLATION:
      return new AppError(409, ErrorCode.CONFLICT, 'This record is immutable');
    case PgCode.SERIALIZATION_FAILURE:
    case PgCode.DEADLOCK_DETECTED:
    case PgCode.LOCK_NOT_AVAILABLE:
      return new AppError(409, ErrorCode.TRANSACTION_CONFLICT, 'The operation conflicted with another request; please retry');
    default:
      return undefined;
  }
}
