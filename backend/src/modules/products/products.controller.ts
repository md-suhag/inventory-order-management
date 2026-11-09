import type { Request } from 'express';
import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { hasPermission } from '../../common/middleware/authorize';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  createProductSchema,
  imageParamsSchema,
  listProductsQuerySchema,
  reorderImagesSchema,
  updateProductSchema,
} from './products.schemas';
import * as imagesService from './product-images.service';
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

// --- Images (FR-PROD-07) -----------------------------------------------------------------------

export const addImages = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  sendData(res, await imagesService.addImages(params.id, files, requestContext(req)), 201);
});

export const getImage = handler({ params: imageParamsSchema }, async ({ params }, _req, res) => {
  const { mimeType, data } = await imagesService.getImageFile(params.id, params.imageId);
  res.set({
    'Content-Type': mimeType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400',
    'Content-Disposition': 'inline',
  });
  res.send(data);
});

export const reorderImages = handler({ params: idParamsSchema, body: reorderImagesSchema }, async ({ params, body }, req, res) => {
  sendData(res, await imagesService.reorderImages(params.id, body.imageIds, requestContext(req)));
});

export const deleteImage = handler({ params: imageParamsSchema }, async ({ params }, req, res) => {
  await imagesService.deleteImage(params.id, params.imageId, requestContext(req));
  res.status(204).end();
});
