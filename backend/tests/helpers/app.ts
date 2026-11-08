import request from 'supertest';
import { createApp } from '../../src/app';
import type { SystemRole } from '../../src/common/auth/permissions';
import { createUser, DEFAULT_PASSWORD } from './db';

export const app = createApp();
export const api = () => request(app);

export interface Session {
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
}

export async function login(email: string, password = DEFAULT_PASSWORD): Promise<Session> {
  const res = await api().post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed (${res.status}): ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.data.user.id,
    email,
    accessToken: res.body.data.accessToken,
    refreshToken: res.body.data.refreshToken,
  };
}

/** Creates a user with the given role and logs in. */
export async function loginAs(role: SystemRole | string = 'STAFF'): Promise<Session> {
  const user = await createUser({ role });
  return login(user.email);
}

export const bearer = (s: Pick<Session, 'accessToken'>) => ({ Authorization: `Bearer ${s.accessToken}` });
