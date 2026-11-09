import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { createCategorySchema, listCategoriesQuerySchema, updateCategorySchema } from './categories.schemas';
import * as categoriesService from './categories.service';

export const list = handler({ query: listCategoriesQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await categoriesService.listCategories(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await categoriesService.getCategory(params.id));
});

export const create = handler({ body: createCategorySchema }, async ({ body }, req, res) => {
  sendData(res, await categoriesService.createCategory(body, requestContext(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateCategorySchema }, async ({ params, body }, req, res) => {
  sendData(res, await categoriesService.updateCategory(params.id, body, requestContext(req)));
});

export const archive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await categoriesService.setCategoryStatus(params.id, 'ARCHIVED', requestContext(req)));
});

export const unarchive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await categoriesService.setCategoryStatus(params.id, 'ACTIVE', requestContext(req)));
});

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await categoriesService.deleteCategory(params.id, requestContext(req));
  res.status(204).end();
});
