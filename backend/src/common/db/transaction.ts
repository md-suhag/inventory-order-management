import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { isRetryableTransactionError, isUniqueViolation } from '../errors/db-errors';

export type Tx = Prisma.TransactionClient;

export interface TransactionOptions {
  /** Attempts including the first one (deadlocks / serialization failures only). */
  maxAttempts?: number;
  timeoutMs?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

/**
 * Runs `fn` in an interactive transaction (READ COMMITTED by default — correctness relies on
 * explicit row locks and DB constraints, see BUSINESS_RULES §12). Deadlocks and serialization
 * failures are retried with jittered backoff; every other error rolls back and propagates.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
  const { maxAttempts = 3, timeoutMs = 10_000, isolationLevel = Prisma.TransactionIsolationLevel.ReadCommitted } = options;
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { timeout: timeoutMs, maxWait: 5_000, isolationLevel });
    } catch (err) {
      if (attempt >= maxAttempts || !isRetryableTransactionError(err)) throw err;
      const delay = 20 * 2 ** attempt + Math.floor(Math.random() * 30);
      logger.warn({ attempt, delay }, 'retrying transaction after conflict');
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Runs an idempotent mutation inside `withTransaction`. If concurrent requests race on the unique
 * `idempotency_key` constraint before seeing each other's uncommitted row, `onReplay` resolves the
 * committed record cleanly instead of surfacing a duplicate error.
 */
export async function withIdempotentTransaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: TransactionOptions & {
    idempotencyKey?: string;
    onReplay?: () => Promise<T | null>;
  } = {},
): Promise<T> {
  const { idempotencyKey, onReplay, ...txOptions } = options;
  try {
    return await withTransaction(fn, txOptions);
  } catch (err) {
    if (idempotencyKey && onReplay && isUniqueViolation(err, 'idempotency_key')) {
      const replayed = await onReplay();
      if (replayed) return replayed;
    }
    throw err;
  }
}
