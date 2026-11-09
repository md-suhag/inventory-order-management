import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as users from './users.controller';

export const usersRouter = Router();

usersRouter.get('/', authenticate, authorize('users.read'), users.list);
usersRouter.post('/', authenticate, authorize('users.manage'), users.create);
usersRouter.get('/:id', authenticate, authorize('users.read'), users.get);
usersRouter.patch('/:id', authenticate, authorize('users.manage'), users.update);
usersRouter.post('/:id/activate', authenticate, authorize('users.manage'), users.activate);
usersRouter.post('/:id/deactivate', authenticate, authorize('users.manage'), users.deactivate);
