import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

export const prisma = new PrismaClient({
  datasources: { db: { url: env.DATABASE_URL } },
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('warn', (e) => logger.warn({ prisma: e.message }, 'prisma warning'));
prisma.$on('error', (e) => logger.error({ prisma: e.message }, 'prisma error'));

/** Prisma client or an interactive-transaction client. Services accept either. */
export type Db = PrismaClient | Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
