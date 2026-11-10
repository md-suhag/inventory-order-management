import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, clearedCookieOptions } from '@/lib/auth/cookies';

export function GET(req: NextRequest) {
  const nextParam = req.nextUrl.searchParams.get('next');
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = '';
  if (nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')) {
    loginUrl.searchParams.set('next', nextParam);
  }

  const res = NextResponse.redirect(loginUrl);
  res.cookies.set(ACCESS_COOKIE, '', clearedCookieOptions());
  res.cookies.set(REFRESH_COOKIE, '', clearedCookieOptions());
  return res;
}
