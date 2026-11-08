import type { Request, RequestHandler, Response } from 'express';
import type { z, ZodType } from 'zod';
import { validationError, type ErrorDetail } from '../errors/app-error';
import type { Paginated } from '../query/list-query';

interface Schemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export interface ValidatedInput<S extends Schemas> {
  body: Infer<S['body']>;
  query: Infer<S['query']>;
  params: Infer<S['params']>;
}

export function zodIssuesToDetails(issues: z.core.$ZodIssue[], prefix?: string): ErrorDetail[] {
  return issues.map((i) => ({
    field: [prefix, ...i.path.map(String)].filter(Boolean).join('.') || undefined,
    message: i.message,
  }));
}

/**
 * Wraps a controller function: validates body/query/params with Zod (unknown keys are
 * stripped by Zod object schemas) and passes the typed result. Validation failures become
 * a 422 VALIDATION_ERROR listing every invalid field. Express 5 forwards rejected promises
 * to the error handler, so controllers can simply throw.
 */
export function handler<S extends Schemas>(
  schemas: S,
  fn: (input: ValidatedInput<S>, req: Request, res: Response) => unknown,
): RequestHandler {
  return async (req, res) => {
    const details: ErrorDetail[] = [];
    const input = { body: undefined, query: undefined, params: undefined } as Record<string, unknown>;
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) input[part] = result.data;
      else details.push(...zodIssuesToDetails(result.error.issues, part === 'body' ? undefined : part));
    }
    if (details.length) throw validationError(details);
    await fn(input as unknown as ValidatedInput<S>, req, res);
  };
}

export function sendData(res: Response, data: unknown, status = 200): void {
  res.status(status).json({ data });
}

export function sendPage<T>(res: Response, page: Paginated<T>): void {
  res.status(200).json(page);
}
