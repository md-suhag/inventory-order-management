import * as React from 'react';
import { AppShell } from '@/components/layout/app-shell';
import { requireSession } from '@/lib/auth/session';

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user, settings } = await requireSession();
  return (
    <AppShell user={user} settings={settings.settings}>
      {children}
    </AppShell>
  );
}
