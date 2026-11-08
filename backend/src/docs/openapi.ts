import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';
import { env } from '../config/env';
import { logger } from '../config/logger';

/** docs/api/openapi.yaml at the repository root (same depth from src/ and dist/). */
export const OPENAPI_SPEC_PATH = env.OPENAPI_SPEC_PATH ?? resolve(__dirname, '../../../docs/api/openapi.yaml');

export function loadOpenApiSpec(): Record<string, unknown> | undefined {
  if (!existsSync(OPENAPI_SPEC_PATH)) return undefined;
  return parse(readFileSync(OPENAPI_SPEC_PATH, 'utf8')) as Record<string, unknown>;
}

/** Swagger UI at /api/docs and the raw spec at /api/docs/openapi.json. */
export function docsRouter(): Router | undefined {
  const spec = loadOpenApiSpec();
  if (!spec) {
    logger.warn({ path: OPENAPI_SPEC_PATH }, 'OpenAPI spec not found; API docs disabled');
    return undefined;
  }
  const router = Router();
  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  router.use('/', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Inventory API docs' }));
  return router;
}
