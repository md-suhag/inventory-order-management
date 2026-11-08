import pinoHttp from 'pino-http';
import { logger } from '../../config/logger';

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as unknown as Express.Request).id,
  autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health') },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customProps: (req) => ({ userId: (req as unknown as Express.Request).auth?.userId }),
  serializers: {
    req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
  },
});
