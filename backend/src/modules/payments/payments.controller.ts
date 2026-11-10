import type { Response } from 'express';
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

function sendIdempotentPayment(
  res: Response,
  result: { replayed: boolean; payment: paymentsService.PaymentDetail },
) {
  if (result.replayed) {
    res.setHeader('Idempotent-Replayed', 'true');
    sendData(res, result.payment, 200);
  } else {
    sendData(res, result.payment, 201);
  }
}

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
    sendIdempotentPayment(res, result);
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
    sendIdempotentPayment(res, result);
  },
);

export const createForPurchase = handler(
  { params: idParamsSchema, body: recordPaymentSchema },
  async ({ params, body }, req, res) => {
    const result = await paymentsService.recordPurchasePayment(
      params.id,
      body,
      requestContext(req),
      req.idempotencyKey,
    );
    sendIdempotentPayment(res, result);
  },
);

export const refundForPurchase = handler(
  { params: idParamsSchema, body: recordRefundSchema },
  async ({ params, body }, req, res) => {
    const result = await paymentsService.recordPurchaseRefund(
      params.id,
      body,
      requestContext(req),
      req.idempotencyKey,
    );
    sendIdempotentPayment(res, result);
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
    sendIdempotentPayment(res, result);
  },
);

export const listForOrder = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await paymentsService.listOrderPayments(params.id));
});

export const listForPurchase = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await paymentsService.listPurchasePayments(params.id));
});
