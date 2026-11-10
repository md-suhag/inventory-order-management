import { describe, it, expect, beforeEach } from 'vitest';
import { api, bearer, loginAs, type Session } from '../helpers/app';
import { resetDatabase } from '../helpers/db';

const BASE = '/api/v1/audit-logs';

let admin: Session;
let manager: Session;
let staff: Session;

beforeEach(async () => {
  await resetDatabase();
  admin = await loginAs('ADMIN');
  manager = await loginAs('MANAGER');
  staff = await loginAs('STAFF');
});

describe('Audit Logs Module (Phase 6)', () => {
  it('enforces RBAC: only users with audit_logs.read (ADMIN) can access (FR-AUD-04)', async () => {
    await api().get(BASE).set(bearer(staff)).expect(403);
    await api().get(BASE).set(bearer(manager)).expect(403);
    await api().get(BASE).set(bearer(admin)).expect(200);
  });

  it('lists recorded audit logs with filtering and search (FR-AUD-01, 02)', async () => {
    // 1. Trigger an action that writes audit logs (e.g. create category)
    await api()
      .post('/api/v1/categories')
      .set(bearer(admin))
      .send({ name: 'Audit Test Category' })
      .expect(201);

    // 2. Fetch audit logs filtered by actor, action, entityType, and date range
    const today = new Date().toISOString().slice(0, 10);
    const res = await api()
      .get(BASE)
      .set(bearer(admin))
      .query({
        actorId: admin.userId,
        action: 'category.created',
        entityType: 'category',
        from: today,
        to: today,
      })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const entry = res.body.data[0];
    expect(entry.action).toBe('category.created');
    expect(entry.entityType).toBe('category');
    expect(entry.actor).toBeDefined();
    expect(entry.actor.email).toBe(admin.email);
    expect(entry.createdAt).toBeDefined();

    // 3. Search filter
    const searchRes = await api()
      .get(BASE)
      .set(bearer(admin))
      .query({ search: 'category.created' })
      .expect(200);

    expect(searchRes.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('retrieves individual audit log by id, returns 404 for unknown (FR-AUD-04)', async () => {
    const categoryRes = await api()
      .post('/api/v1/categories')
      .set(bearer(admin))
      .send({ name: 'Audit Single Item' })
      .expect(201);

    const listRes = await api()
      .get(BASE)
      .set(bearer(admin))
      .query({ entityId: categoryRes.body.data.id })
      .expect(200);

    expect(listRes.body.data.length).toBeGreaterThanOrEqual(1);
    const logId = listRes.body.data[0].id;

    const singleRes = await api()
      .get(`${BASE}/${logId}`)
      .set(bearer(admin))
      .expect(200);

    expect(singleRes.body.data.id).toBe(logId);
    expect(singleRes.body.data.action).toBe('category.created');

    await api()
      .get(`${BASE}/018f0000-0000-7000-8000-000000000099`)
      .set(bearer(admin))
      .expect(404);
  });
});
