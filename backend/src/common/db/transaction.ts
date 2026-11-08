import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { isRetryableTransactionError } from '../errors/db-errors';

export type Tx = Prisma.TransactionClient;

interface TransactionOptions {
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
