import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_BASE_URL: z.string().url().default('http://localhost:4000/api/v1'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  SESSION_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export interface ServerEnv {
  NODE_ENV: 'development' | 'test' | 'production';
  API_BASE_URL: string;
  APP_URL: string;
  SESSION_COOKIE_SECURE: boolean;
}

let cachedEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;
  const parsed = serverEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    API_BASE_URL: process.env.API_BASE_URL ?? 'http://localhost:4000/api/v1',
    APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
    SESSION_COOKIE_SECURE: process.env.SESSION_COOKIE_SECURE,
  });
  cachedEnv = {
    NODE_ENV: parsed.NODE_ENV,
    API_BASE_URL: parsed.API_BASE_URL.replace(/\/+$/, ''),
    APP_URL: parsed.APP_URL.replace(/\/+$/, ''),
    SESSION_COOKIE_SECURE: parsed.SESSION_COOKIE_SECURE || parsed.NODE_ENV === 'production',
  };
  return cachedEnv;
}
