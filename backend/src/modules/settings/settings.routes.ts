import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as settings from './settings.controller';

export const settingsRouter = Router();

settingsRouter.use(authenticate);

settingsRouter.get('/', settings.get);
settingsRouter.patch('/', authorize('settings.update'), settings.update);
settingsRouter.put('/', authorize('settings.update'), settings.update);
settingsRouter.patch(
  '/sequences/:documentType',
  authorize('settings.update'),
  settings.updateSequence,
);
settingsRouter.patch(
  '/payment-methods/:id',
  authorize('settings.update'),
  settings.updatePaymentMethod,
);
