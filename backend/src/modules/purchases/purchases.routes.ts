import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { requireIdempotencyKey } from '../../common/middleware/idempotency-key';
import * as purchases from './purchases.controller';
import * as payments from '../payments/payments.controller';

export const purchasesRouter = Router();

purchasesRouter.get('/', authenticate, authorize('purchases.read'), purchases.list);
purchasesRouter.post('/', authenticate, authorize('purchases.manage'), purchases.create);
purchasesRouter.get('/:id', authenticate, authorize('purchases.read'), purchases.get);
purchasesRouter.patch('/:id', authenticate, authorize('purchases.manage'), purchases.update);
purchasesRouter.delete('/:id', authenticate, authorize('purchases.manage'), purchases.remove);
purchasesRouter.post('/:id/confirm', authenticate, authorize('purchases.confirm'), purchases.confirm);
purchasesRouter.post('/:id/cancel', authenticate, authorize('purchases.cancel'), purchases.cancel);
purchasesRouter.post(
  '/:id/receipts',
  authenticate,
  authorize('purchases.receive'),
  requireIdempotencyKey,
  purchases.receive,
);
purchasesRouter.get('/:id/receipts', authenticate, authorize('purchases.read'), purchases.listReceipts);

purchasesRouter.post(
  '/:id/payments',
  authenticate,
  authorize('payments.record_supplier'),
  requireIdempotencyKey,
  payments.createForPurchase,
);
purchasesRouter.post(
  '/:id/refunds',
  authenticate,
  authorize('payments.refund'),
  requireIdempotencyKey,
  payments.refundForPurchase,
);
purchasesRouter.get('/:id/payments', authenticate, authorize('payments.read'), payments.listForPurchase);
