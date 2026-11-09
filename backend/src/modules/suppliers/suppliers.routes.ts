import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as suppliers from './suppliers.controller';

export const suppliersRouter = Router();

suppliersRouter.get('/', authenticate, authorize('suppliers.read'), suppliers.list);
suppliersRouter.post('/', authenticate, authorize('suppliers.manage'), suppliers.create);
suppliersRouter.get('/:id', authenticate, authorize('suppliers.read'), suppliers.get);
suppliersRouter.patch('/:id', authenticate, authorize('suppliers.manage'), suppliers.update);
suppliersRouter.delete('/:id', authenticate, authorize('suppliers.manage'), suppliers.remove);
suppliersRouter.post('/:id/archive', authenticate, authorize('suppliers.manage'), suppliers.archive);
suppliersRouter.post('/:id/unarchive', authenticate, authorize('suppliers.manage'), suppliers.unarchive);
