import { Router } from 'express';
import { authenticate } from '../../common/middleware/authenticate';
import { authorize } from '../../common/middleware/authorize';
import * as auditLogs from './audit-logs.controller';

export const auditLogsRouter = Router();

auditLogsRouter.use(authenticate, authorize('audit_logs.read'));

auditLogsRouter.get('/', auditLogs.list);
auditLogsRouter.get('/:id', auditLogs.get);
