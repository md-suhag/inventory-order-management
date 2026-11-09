import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as products from './products.controller';

export const productsRouter = Router();

productsRouter.get('/', authenticate, authorize('products.read'), products.list);
productsRouter.post('/', authenticate, authorize('products.manage'), products.create);
productsRouter.get('/:id', authenticate, authorize('products.read'), products.get);
productsRouter.patch('/:id', authenticate, authorize('products.manage'), products.update);
productsRouter.delete('/:id', authenticate, authorize('products.manage'), products.remove);
productsRouter.post('/:id/archive', authenticate, authorize('products.manage'), products.archive);
productsRouter.post('/:id/unarchive', authenticate, authorize('products.manage'), products.unarchive);
