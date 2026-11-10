import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearedCookieOptions,
  isJwtExpiringSoon,
  refreshCookieOptions,
} from '@/lib/auth/cookies';
import { refreshTokenPair } from '@/lib/api/client';

const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/reset-password'];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/api/auth/')) return true;
  if (pathname.startsWith('/_next/') || pathname === '/favicon.ico') return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function redirectToLogin(req: NextRequest, clearCookies = false): NextResponse {
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  loginUrl.search = '';
  if (nextPath && nextPath !== '/') {
    loginUrl.searchParams.set('next', nextPath);
  }
  const res = NextResponse.redirect(loginUrl);
  if (clearCookies) {
    res.cookies.set(ACCESS_COOKIE, '', clearedCookieOptions());
    res.cookies.set(REFRESH_COOKIE, '', clearedCookieOptions());
  }
  return res;
}

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;

  if (!accessToken && !refreshToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Authentication required' } },
        { status: 401 },
      );
    }
    return redirectToLogin(req);
  }

  if (accessToken && !isJwtExpiringSoon(accessToken, 30)) {
    return NextResponse.next();
  }

  if (!refreshToken) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Session expired' } },
        { status: 401 },
      );
    }
    return redirectToLogin(req, true);
  }

  const pair = await refreshTokenPair(refreshToken);
  if (!pair) {
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Session expired' } },
        { status: 401 },
      );
      res.cookies.set(ACCESS_COOKIE, '', clearedCookieOptions());
      res.cookies.set(REFRESH_COOKIE, '', clearedCookieOptions());
      return res;
    }
    return redirectToLogin(req, true);
  }

  // Forward updated cookies to Server Components / Route Handlers in the same request
  const requestHeaders = new Headers(req.headers);
  const existingCookies = req.cookies.getAll().filter(
    (c) => c.name !== ACCESS_COOKIE && c.name !== REFRESH_COOKIE,
  );
  const updatedCookieHeader = [
    ...existingCookies.map((c) => `${c.name}=${c.value}`),
    `${ACCESS_COOKIE}=${pair.accessToken}`,
    `${REFRESH_COOKIE}=${pair.refreshToken}`,
  ].join('; ');
  requestHeaders.set('cookie', updatedCookieHeader);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.cookies.set(ACCESS_COOKIE, pair.accessToken, accessCookieOptions(pair.accessTokenExpiresIn));
  res.cookies.set(REFRESH_COOKIE, pair.refreshToken, refreshCookieOptions(pair.refreshTokenExpiresAt));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
