import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { requireIdempotencyKey } from '../../common/middleware/idempotency-key';
import * as orders from './orders.controller';
import * as payments from '../payments/payments.controller';

export const ordersRouter = Router();

ordersRouter.get('/', authenticate, authorize('orders.read'), orders.list);
ordersRouter.post('/', authenticate, authorize('orders.manage'), orders.create);
ordersRouter.get('/:id', authenticate, authorize('orders.read'), orders.get);
ordersRouter.patch('/:id', authenticate, authorize('orders.manage'), orders.update);
ordersRouter.delete('/:id', authenticate, authorize('orders.manage'), orders.remove);
ordersRouter.post('/:id/confirm', authenticate, authorize('orders.confirm'), orders.confirm);
ordersRouter.post('/:id/cancel', authenticate, authorize('orders.manage'), orders.cancel);
ordersRouter.post('/:id/ship', authenticate, authorize('orders.complete'), orders.ship);
ordersRouter.post('/:id/deliver', authenticate, authorize('orders.complete'), orders.deliver);
ordersRouter.post('/:id/complete', authenticate, authorize('orders.complete'), orders.complete);
ordersRouter.get('/:id/invoice', authenticate, authorize('orders.read'), orders.getInvoice);

// Payment sub-routes for orders
ordersRouter.post(
  '/:id/payments',
  authenticate,
  authorize('payments.record_customer'),
  requireIdempotencyKey,
  payments.createForOrder,
);
ordersRouter.post(
  '/:id/refunds',
  authenticate,
  authorize('payments.refund'),
  requireIdempotencyKey,
  payments.refundForOrder,
);
ordersRouter.get('/:id/payments', authenticate, authorize('payments.read'), payments.listForOrder);
