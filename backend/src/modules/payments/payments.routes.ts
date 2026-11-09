import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { requireIdempotencyKey } from '../../common/middleware/idempotency-key';
import * as payments from './payments.controller';

export const paymentsRouter = Router();

paymentsRouter.get('/', authenticate, authorize('payments.read'), payments.list);
paymentsRouter.get('/:id', authenticate, authorize('payments.read'), payments.get);
paymentsRouter.post(
  '/:id/reverse',
  authenticate,
  authorize('payments.reverse'),
  requireIdempotencyKey,
  payments.reverse,
);
