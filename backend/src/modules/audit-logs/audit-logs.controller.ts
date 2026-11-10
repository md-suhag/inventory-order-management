import { handler, sendData, sendPage } from '../../common/http/handler';
import { idParamsSchema } from '../../common/validation/schemas';
import { listAuditLogsQuerySchema } from './audit-logs.schemas';
import * as auditLogsService from './audit-logs.service';

export const list = handler({ query: listAuditLogsQuerySchema }, async ({ query }, _req, res) => {
  sendPage(res, await auditLogsService.listAuditLogs(query));
});

export const get = handler({ params: idParamsSchema }, async ({ params }, _req, res) => {
  sendData(res, await auditLogsService.getAuditLog(params.id));
});
