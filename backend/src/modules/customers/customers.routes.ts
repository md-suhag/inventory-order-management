import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as customers from './customers.controller';

export const customersRouter = Router();

customersRouter.get('/', authenticate, authorize('customers.read'), customers.list);
customersRouter.post('/', authenticate, authorize('customers.manage'), customers.create);
customersRouter.get('/:id', authenticate, authorize('customers.read'), customers.get);
customersRouter.patch('/:id', authenticate, authorize('customers.manage'), customers.update);
customersRouter.delete('/:id', authenticate, authorize('customers.archive'), customers.remove);
customersRouter.post('/:id/archive', authenticate, authorize('customers.archive'), customers.archive);
customersRouter.post('/:id/unarchive', authenticate, authorize('customers.archive'), customers.unarchive);
