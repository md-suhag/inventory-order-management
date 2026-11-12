import { Router } from 'express';
import { prisma } from '../../config/prisma';

export const healthRouter = Router();

/** Liveness: the process is up and serving requests. */
healthRouter.get('/live', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Readiness: dependencies (database) are reachable. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', checks: { database: 'ok' } });
  } catch {
    res.status(503).json({ status: 'unavailable', checks: { database: 'unreachable' } });
  }
});
