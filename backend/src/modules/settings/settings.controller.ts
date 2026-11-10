import { requestContext } from '../../common/audit/audit';
import { handler, sendData } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import {
  documentTypeParamSchema,
  updatePaymentMethodSchema,
  updateSequenceSchema,
  updateSettingsSchema,
} from './settings.schemas';
import * as settingsService from './settings.service';

export const get = handler({}, async (_args, _req, res) => {
  sendData(res, await settingsService.getSettings());
});

export const update = handler({ body: updateSettingsSchema }, async ({ body }, req, res) => {
  sendData(res, await settingsService.updateSettings(body, requestContext(req)));
});

export const updateSequence = handler(
  { params: documentTypeParamSchema, body: updateSequenceSchema },
  async ({ params, body }, req, res) => {
    sendData(
      res,
      await settingsService.updateSequence(params.documentType, body, requestContext(req)),
    );
  },
);

export const updatePaymentMethod = handler(
  { params: idParamsSchema, body: updatePaymentMethodSchema },
  async ({ params, body }, req, res) => {
    sendData(
      res,
      await settingsService.updatePaymentMethod(params.id, body, requestContext(req)),
    );
  },
);
