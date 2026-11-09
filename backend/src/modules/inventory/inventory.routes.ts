import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import { requireIdempotencyKey } from '../../common/middleware/idempotency-key';
import * as inventory from './inventory.controller';

export const inventoryRouter = Router();

inventoryRouter.get('/', authenticate, authorize('inventory.read'), inventory.list);
inventoryRouter.get('/low-stock', authenticate, authorize('inventory.read'), inventory.lowStock);
inventoryRouter.post(
  '/adjustments',
  authenticate,
  authorize('inventory.adjust'),
  requireIdempotencyKey,
  inventory.adjust,
);
inventoryRouter.get('/movements', authenticate, authorize('inventory.read'), inventory.movements);
inventoryRouter.get('/movements/:id', authenticate, authorize('inventory.read'), inventory.getMovement);
