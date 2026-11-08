import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../../src/common/errors/app-error';
import { getPgCode, isRetryableTransactionError, isUniqueViolation, mapDbError } from '../../src/common/errors/db-errors';

const known = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('db error', { code, clientVersion: 'test', meta });

describe('database error mapping', () => {
  it('maps unique violations to 409 DUPLICATE with fields', () => {
    const err = mapDbError(known('P2002', { target: ['email'] }));
    expect(err).toMatchObject({ status: 409, code: ErrorCode.DUPLICATE });
    expect(err?.details).toEqual([{ field: 'email', message: 'Must be unique' }]);
    expect(isUniqueViolation(known('P2002', { target: ['email'] }), 'email')).toBe(true);
    expect(isUniqueViolation(known('P2002', { target: ['sku'] }), 'email')).toBe(false);
  });

  it('maps FK violations, missing records and check violations', () => {
    expect(mapDbError(known('P2003'))).toMatchObject({ status: 409, code: ErrorCode.REFERENCED });
    expect(mapDbError(known('P2025'))).toMatchObject({ status: 404, code: ErrorCode.NOT_FOUND });
    expect(mapDbError(new Error('new row for relation "products" violates check constraint "x"'))).toMatchObject({
      status: 422,
    });
  });

  it('reads SQLSTATE from raw query errors', () => {
    const raw = known('P2010', { code: '23001', message: 'append-only' });
    expect(getPgCode(raw)).toBe('23001');
    expect(mapDbError(raw)).toMatchObject({ status: 409, code: ErrorCode.CONFLICT });
  });

  it('treats deadlocks and write conflicts as retryable', () => {
    expect(isRetryableTransactionError(known('P2034'))).toBe(true);
    expect(isRetryableTransactionError(new Error('ERROR: deadlock detected'))).toBe(true);
    expect(isRetryableTransactionError(known('P2002'))).toBe(false);
    expect(mapDbError(known('P2034'))).toMatchObject({ status: 409, code: ErrorCode.TRANSACTION_CONFLICT });
  });

  it('returns undefined for unrelated errors', () => {
    expect(mapDbError(new Error('boom'))).toBeUndefined();
  });
});
