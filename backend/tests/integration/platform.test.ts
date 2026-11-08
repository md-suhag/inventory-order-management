import { beforeAll, describe, expect, it } from 'vitest';
import { loadOpenApiSpec } from '../../src/docs/openapi';
import { listRoutes } from '../../src/routes';
import { api } from '../helpers/app';
import { prisma, resetDatabase } from '../helpers/db';

beforeAll(resetDatabase);

describe('health', () => {
  it('live and ready report ok', async () => {
    expect((await api().get('/api/v1/health/live')).body.status).toBe('ok');
    const ready = await api().get('/api/v1/health/ready').expect(200);
    expect(ready.body.checks.database).toBe('ok');
  });
});

describe('error handling & HTTP hygiene', () => {
  it('returns the error envelope with a request id for unknown routes', async () => {
    const res = await api().get('/api/v1/does-not-exist').expect(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', requestId: expect.any(String) });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('echoes a valid client request id and replaces an invalid one', async () => {
    const ok = await api().get('/api/v1/health/live').set('X-Request-Id', 'client-req-12345');
    expect(ok.headers['x-request-id']).toBe('client-req-12345');
    const bad = await api().get('/api/v1/health/live').set('X-Request-Id', 'bad id with spaces');
    expect(bad.headers['x-request-id']).not.toBe('bad id with spaces');
  });

  it('rejects malformed JSON with 400 and oversized bodies with 413', async () => {
    const malformed = await api()
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('BAD_REQUEST');

    const big = await api()
      .post('/api/v1/auth/login')
      .send({ email: 'a@b.co', password: 'x'.repeat(200_000) });
    expect(big.status).toBe(413);
  });

  it('sets security headers and hides the framework', async () => {
    const res = await api().get('/api/v1/health/live');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });

  it('allows only configured CORS origins', async () => {
    const allowed = await api().options('/api/v1/auth/login').set('Origin', 'http://localhost:3000').set('Access-Control-Request-Method', 'POST');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    const denied = await api().options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('audit log immutability', () => {
  it('rejects UPDATE and DELETE on audit_logs at the database level', async () => {
    const row = await prisma.auditLog.create({ data: { action: 'test.event', entityType: 'test' } });
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});

describe('API documentation', () => {
  it('serves Swagger UI and the raw spec', async () => {
    const json = await api().get('/api/docs/openapi.json').expect(200);
    expect(json.body.openapi).toMatch(/^3\./);
    const ui = await api().get('/api/docs/').expect(200);
    expect(ui.text).toContain('swagger-ui');
  });

  it('documents every registered route, and documents no route that does not exist', () => {
    const spec = loadOpenApiSpec() as { paths: Record<string, Record<string, unknown>> };
    const documented = new Set(
      Object.entries(spec.paths).flatMap(([path, ops]) =>
        Object.keys(ops)
          .filter((m) => ['get', 'post', 'put', 'patch', 'delete'].includes(m))
          .map((m) => `${m} /api/v1${path}`),
      ),
    );
    const registered = new Set(listRoutes().map((r) => `${r.method} ${r.path.replace(/:(\w+)/g, '{$1}')}`));

    expect([...registered].filter((r) => !documented.has(r)), 'undocumented routes').toEqual([]);
    expect([...documented].filter((r) => !registered.has(r)), 'documented but not implemented').toEqual([]);
  });
});
