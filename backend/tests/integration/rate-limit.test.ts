import { beforeAll, describe, expect, it } from 'vitest';
import { env } from '../../src/config/env';
import { api } from '../helpers/app';
import { resetDatabase } from '../helpers/db';

// Rate limiting is disabled for the other suites; this file (own module graph) turns it on.
beforeAll(async () => {
  await resetDatabase();
  (env as { RATE_LIMIT_ENABLED: boolean }).RATE_LIMIT_ENABLED = true;
});

describe('auth rate limiting', () => {
  it('returns 429 RATE_LIMITED after 10 login attempts per minute from one IP', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await api().post('/api/v1/auth/login').send({ email: 'x@test.local', password: 'Wrong12345' });
      statuses.push(res.status);
      if (res.status === 429) expect(res.body.error.code).toBe('RATE_LIMITED');
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
