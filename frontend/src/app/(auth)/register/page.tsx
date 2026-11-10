import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth/session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Register' };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <RegisterForm />;
}
