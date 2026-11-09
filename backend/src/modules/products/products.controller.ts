import type { Request } from 'express';
import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { hasPermission } from '../../common/middleware/authorize';
import { idParamsSchema } from '../../common/validation/schemas';
import { createProductSchema, listProductsQuerySchema, updateProductSchema } from './products.schemas';
import * as productsService from './products.service';
import { removeStoredFiles } from './product-images.storage';

const viewerOf = (req: Request): productsService.Viewer => ({
  canViewCost: hasPermission(req.auth, 'products.view_cost'),
});

export const list = handler({ query: listProductsQuerySchema }, async ({ query }, req, res) => {
  sendPage(res, await productsService.listProducts(query, viewerOf(req)));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await productsService.getProduct(params.id, viewerOf(req)));
});

export const create = handler({ body: createProductSchema }, async ({ body }, req, res) => {
  sendData(res, await productsService.createProduct(body, requestContext(req), viewerOf(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateProductSchema }, async ({ params, body }, req, res) => {
  sendData(res, await productsService.updateProduct(params.id, body, requestContext(req), viewerOf(req)));
});

export const archive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await productsService.setArchived(params.id, true, requestContext(req), viewerOf(req)));
});

export const unarchive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await productsService.setArchived(params.id, false, requestContext(req), viewerOf(req)));
});

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  const files = await productsService.deleteProduct(params.id, requestContext(req));
  await removeStoredFiles(files);
  res.status(204).end();
});
