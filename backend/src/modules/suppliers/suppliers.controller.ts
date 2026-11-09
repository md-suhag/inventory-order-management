import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { createSupplierSchema, listSuppliersQuerySchema, updateSupplierSchema } from './suppliers.schemas';
import * as suppliersService from './suppliers.service';

export const list = handler({ query: listSuppliersQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await suppliersService.listSuppliers(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await suppliersService.getSupplier(params.id));
});

export const create = handler({ body: createSupplierSchema }, async ({ body }, req, res) => {
  sendData(res, await suppliersService.createSupplier(body, requestContext(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateSupplierSchema }, async ({ params, body }, req, res) => {
  sendData(res, await suppliersService.updateSupplier(params.id, body, requestContext(req)));
});

export const archive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await suppliersService.setSupplierStatus(params.id, 'ARCHIVED', requestContext(req)));
});

export const unarchive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await suppliersService.setSupplierStatus(params.id, 'ACTIVE', requestContext(req)));
});

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await suppliersService.deleteSupplier(params.id, requestContext(req));
  res.status(204).end();
});
