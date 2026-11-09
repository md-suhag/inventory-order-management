import type { Request } from 'express';
import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { hasPermission } from '../../common/middleware/authorize';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  shipOrderSchema,
  updateOrderSchema,
} from './orders.schemas';
import * as ordersService from './orders.service';

const actorOf = (req: Request): ordersService.OrderActor => ({
  ...requestContext(req),
  canApplyDiscount: hasPermission(req.auth, 'orders.discount'),
  canCancelConfirmed: hasPermission(req.auth, 'orders.cancel'),
});

export const list = handler({ query: listOrdersQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await ordersService.listOrders(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await ordersService.getOrder(params.id));
});

export const create = handler({ body: createOrderSchema }, async ({ body }, req, res) => {
  sendData(res, await ordersService.createOrder(body, actorOf(req)), 201);
});

export const update = handler(
  { params: idParamsSchema, body: updateOrderSchema },
  async ({ params, body }, req, res) => {
    sendData(res, await ordersService.updateOrder(params.id, body, actorOf(req)));
  },
);

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await ordersService.deleteOrder(params.id, requestContext(req));
  res.status(204).end();
});

export const confirm = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await ordersService.confirmOrder(params.id, requestContext(req)));
});

export const cancel = handler(
  { params: idParamsSchema, body: cancelOrderSchema },
  async ({ params, body }, req, res) => {
    sendData(res, await ordersService.cancelOrder(params.id, body, actorOf(req)));
  },
);

export const ship = handler(
  { params: idParamsSchema, body: shipOrderSchema },
  async ({ params, body }, req, res) => {
    sendData(res, await ordersService.shipOrder(params.id, body, requestContext(req)));
  },
);

export const deliver = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await ordersService.deliverOrder(params.id, requestContext(req)));
});

export const complete = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await ordersService.completeOrder(params.id, requestContext(req)));
});

export const getInvoice = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await ordersService.getInvoice(params.id));
});
