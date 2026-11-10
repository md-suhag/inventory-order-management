import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign In' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; loggedOutAll?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user) {
    const safeNext = params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/';
    redirect(safeNext);
  }

  let bannerMessage: string | null = null;
  if (params.reset === '1') {
    bannerMessage = 'Your password has been reset. Sign in with your new password.';
  } else if (params.loggedOutAll === '1') {
    bannerMessage = 'All active sessions have been signed out.';
  }

  return <LoginForm nextPath={params.next} bannerMessage={bannerMessage} />;
}
