import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { createCustomerSchema, listCustomersQuerySchema, updateCustomerSchema } from './customers.schemas';
import * as customersService from './customers.service';

export const list = handler({ query: listCustomersQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await customersService.listCustomers(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await customersService.getCustomer(params.id));
});

export const create = handler({ body: createCustomerSchema }, async ({ body }, req, res) => {
  sendData(res, await customersService.createCustomer(body, requestContext(req)), 201);
});

export const update = handler({ params: idParamsSchema, body: updateCustomerSchema }, async ({ params, body }, req, res) => {
  sendData(res, await customersService.updateCustomer(params.id, body, requestContext(req)));
});

export const archive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await customersService.setCustomerStatus(params.id, 'ARCHIVED', requestContext(req)));
});

export const unarchive = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await customersService.setCustomerStatus(params.id, 'ACTIVE', requestContext(req)));
});

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await customersService.deleteCustomer(params.id, requestContext(req));
  res.status(204).end();
});
