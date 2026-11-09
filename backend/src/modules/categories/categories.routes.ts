import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as categories from './categories.controller';

export const categoriesRouter = Router();

categoriesRouter.get('/', authenticate, authorize('categories.read'), categories.list);
categoriesRouter.post('/', authenticate, authorize('categories.manage'), categories.create);
categoriesRouter.get('/:id', authenticate, authorize('categories.read'), categories.get);
categoriesRouter.patch('/:id', authenticate, authorize('categories.manage'), categories.update);
categoriesRouter.delete('/:id', authenticate, authorize('categories.manage'), categories.remove);
categoriesRouter.post('/:id/archive', authenticate, authorize('categories.manage'), categories.archive);
categoriesRouter.post('/:id/unarchive', authenticate, authorize('categories.manage'), categories.unarchive);
