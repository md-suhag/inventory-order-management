import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as roles from './roles.controller';

export const rolesRouter = Router();

// `/permissions` must be registered before `/:id`.
rolesRouter.get('/permissions', authenticate, authorize('roles.read'), roles.permissions);
rolesRouter.get('/', authenticate, authorize('roles.read'), roles.list);
rolesRouter.post('/', authenticate, authorize('roles.manage'), roles.create);
rolesRouter.get('/:id', authenticate, authorize('roles.read'), roles.get);
rolesRouter.patch('/:id', authenticate, authorize('roles.manage'), roles.update);
rolesRouter.delete('/:id', authenticate, authorize('roles.manage'), roles.remove);
