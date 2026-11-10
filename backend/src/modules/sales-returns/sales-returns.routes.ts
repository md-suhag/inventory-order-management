import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { requireIdempotencyKey } from '../../common/middleware/idempotency-key';
import * as salesReturns from './sales-returns.controller';

export const salesReturnsRouter = Router();

salesReturnsRouter.get('/', authenticate, authorize('returns.read'), salesReturns.list);
salesReturnsRouter.post(
  '/',
  authenticate,
  authorize('returns.create'),
  requireIdempotencyKey,
  salesReturns.create,
);
salesReturnsRouter.get('/:id', authenticate, authorize('returns.read'), salesReturns.get);
salesReturnsRouter.post(
  '/:id/complete',
  authenticate,
  authorize('returns.process'),
  salesReturns.complete,
);
salesReturnsRouter.post(
  '/:id/reject',
  authenticate,
  authorize('returns.process'),
  salesReturns.reject,
);
salesReturnsRouter.post(
  '/:id/refund',
  authenticate,
  authorize('payments.refund'),
  requireIdempotencyKey,
  salesReturns.refund,
);
