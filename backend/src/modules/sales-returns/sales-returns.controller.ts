import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  completeSalesReturnSchema,
  createSalesReturnSchema,
  listSalesReturnsQuerySchema,
  refundSalesReturnSchema,
  rejectSalesReturnSchema,
} from './sales-returns.schemas';
import * as salesReturnsService from './sales-returns.service';

export const list = handler({ query: listSalesReturnsQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await salesReturnsService.listSalesReturns(query));
});

export const create = handler({ body: createSalesReturnSchema }, async ({ body }, req, res) => {
  const result = await salesReturnsService.createSalesReturn(
    body,
    requestContext(req),
    req.idempotencyKey,
  );
  if (result.replayed) {
    res.setHeader('Idempotent-Replayed', 'true');
    sendData(res, result.salesReturn, 200);
  } else {
    sendData(res, result.salesReturn, 201);
  }
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await salesReturnsService.getSalesReturn(params.id));
});

export const complete = handler(
  { params: idParamsSchema, body: completeSalesReturnSchema },
  async ({ params, body }, req, res) => {
    sendData(
      res,
      await salesReturnsService.completeSalesReturn(params.id, body, requestContext(req)),
    );
  },
);

export const reject = handler(
  { params: idParamsSchema, body: rejectSalesReturnSchema },
  async ({ params, body }, req, res) => {
    sendData(
      res,
      await salesReturnsService.rejectSalesReturn(params.id, body, requestContext(req)),
    );
  },
);

export const refund = handler(
  { params: idParamsSchema, body: refundSalesReturnSchema },
  async ({ params, body }, req, res) => {
    const result = await salesReturnsService.refundSalesReturn(
      params.id,
      body,
      requestContext(req),
      req.idempotencyKey,
    );
    if (result.replayed) {
      res.setHeader('Idempotent-Replayed', 'true');
      sendData(res, result.payment, 200);
    } else {
      sendData(res, result.payment, 201);
    }
  },
);
