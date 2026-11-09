import { requestContext } from '../../common/audit/audit';
import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  listPaymentsQuerySchema,
  recordPaymentSchema,
  recordRefundSchema,
  reversePaymentSchema,
} from './payments.schemas';
import * as paymentsService from './payments.service';

export const list = handler({ query: listPaymentsQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await paymentsService.listPayments(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await paymentsService.getPayment(params.id));
});

export const createForOrder = handler(
  { params: idParamsSchema, body: recordPaymentSchema },
  async ({ params, body }, req, res) => {
    const result = await paymentsService.recordOrderPayment(
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

export const refundForOrder = handler(
  { params: idParamsSchema, body: recordRefundSchema },
  async ({ params, body }, req, res) => {
    const result = await paymentsService.recordOrderRefund(
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

export const reverse = handler(
  { params: idParamsSchema, body: reversePaymentSchema },
  async ({ params, body }, req, res) => {
    const result = await paymentsService.reversePayment(
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

export const listForOrder = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await paymentsService.listOrderPayments(params.id));
});
