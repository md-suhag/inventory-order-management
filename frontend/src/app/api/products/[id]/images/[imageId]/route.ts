import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/cookies';
import { clearSessionCookies, refreshTokenPair, setSessionCookies } from '@/lib/api/client';
import { getServerEnv } from '@/lib/env';

async function fetchImage(productId: string, imageId: string, accessToken: string | undefined): Promise<Response> {
  const { API_BASE_URL } = getServerEnv();
  return fetch(`${API_BASE_URL}/products/${productId}/images/${imageId}`, {
    method: 'GET',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    cache: 'no-store',
  });
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await context.params;
  const store = await cookies();
  let accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;

  let res = await fetchImage(id, imageId, accessToken);

  if (res.status === 401 && refreshToken) {
    const pair = await refreshTokenPair(refreshToken);
    if (pair) {
      await setSessionCookies(pair);
      accessToken = pair.accessToken;
      res = await fetchImage(id, imageId, accessToken);
    } else {
      await clearSessionCookies();
    }
  }

  if (!res.ok) {
    return new NextResponse(null, { status: res.status });
  }

  const bytes = await res.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
