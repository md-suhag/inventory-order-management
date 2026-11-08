import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './common/middleware/error-handler';
import { httpLogger } from './common/middleware/http-logger';
import { globalLimiter } from './common/middleware/rate-limit';
import { requestId } from './common/middleware/request-id';
import { docsRouter } from './docs/openapi';
import { API_PREFIX, apiModules } from './routes';

/** Builds the Express application (no network listener — used by server.ts and tests). */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(httpLogger);

  if (env.SWAGGER_ENABLED) {
    const docs = docsRouter();
    // Swagger UI needs inline scripts/styles, so it is mounted before the strict CSP.
    if (docs) app.use('/api/docs', helmet({ contentSecurityPolicy: false }), docs);
  }

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(globalLimiter);
  app.use(express.json({ limit: '100kb' }));

  for (const { path, router } of apiModules) app.use(`${API_PREFIX}${path}`, router);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
