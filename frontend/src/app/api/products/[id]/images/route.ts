import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';
import { clearSessionCookies, refreshTokenPair, setSessionCookies } from '@/lib/api/client';
import { getServerEnv } from '@/lib/env';
import { isValidUuid } from '@/lib/security';

async function forwardImageRequest(
  path: string,
  init: RequestInit,
  accessToken: string | undefined,
): Promise<Response> {
  const { API_BASE_URL } = getServerEnv();
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: { code: 'BAD_REQUEST', message: 'Invalid product identifier' } },
      { status: 400 },
    );
  }
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  const formData = await req.formData();
  let res = await forwardImageRequest(
    `/products/${id}/images`,
    { method: 'POST', body: formData },
    accessToken,
  );

  if (res.status === 401 && refreshToken) {
    const pair = await refreshTokenPair(refreshToken);
    if (pair) {
      await setSessionCookies(pair);
      accessToken = pair.accessToken;
      res = await forwardImageRequest(
        `/products/${id}/images`,
        { method: 'POST', body: formData },
        accessToken,
      );
    } else {
      await clearSessionCookies();
    }
  }

  const text = await res.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: res.status });
  } catch {
    return new NextResponse(text, { status: res.status });
  }
}
