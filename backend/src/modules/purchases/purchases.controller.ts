import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  createPurchaseSchema,
  listPurchasesQuerySchema,
  receiveGoodsSchema,
  updatePurchaseSchema,
} from './purchases.schemas';
import * as purchasesService from './purchases.service';

export const list = handler({ query: listPurchasesQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await purchasesService.listPurchases(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await purchasesService.getPurchase(params.id));
});

export const create = handler({ body: createPurchaseSchema }, async ({ body }, req, res) => {
  sendData(res, await purchasesService.createPurchase(body, requestContext(req)), 201);
});

export const update = handler(
  { params: idParamsSchema, body: updatePurchaseSchema },
  async ({ params, body }, req, res) => {
    sendData(res, await purchasesService.updatePurchase(params.id, body, requestContext(req)));
  },
);

export const remove = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  await purchasesService.deletePurchase(params.id, requestContext(req));
  res.status(204).end();
});

export const confirm = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await purchasesService.confirmPurchase(params.id, requestContext(req)));
});

export const cancel = handler({ params: idParamsSchema }, async ({ params }, req, res) => {
  sendData(res, await purchasesService.cancelPurchase(params.id, requestContext(req)));
});

export const receive = handler(
  { params: idParamsSchema, body: receiveGoodsSchema },
  async ({ params, body }, req, res) => {
    const result = await purchasesService.receiveGoods(
      params.id,
      body,
      requestContext(req),
      req.idempotencyKey,
    );
    if (result.replayed) {
      res.setHeader('Idempotent-Replayed', 'true');
      sendData(res, result.receipt, 200);
    } else {
      sendData(res, result.receipt, 201);
    }
  },
);

export const listReceipts = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await purchasesService.listPurchaseReceipts(params.id));
});
