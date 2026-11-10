import type { Metadata } from 'next';
import { can, requireSession } from '@/lib/auth/session';
import { AccessDenied } from '@/components/shared/access-denied';
import { PageHeader } from '@/components/shared/page-header';
import { SettingsClient } from './settings-client';

export const metadata: Metadata = { title: 'Business Settings' };

export default async function SettingsPage() {
  const { user, settings } = await requireSession();
  if (!can(user, 'settings.update')) {
    return <AccessDenied />;
  }

  return (
    <>
      <PageHeader
        title="Business Settings"
        description="Configure business profile, tax defaults, document sequences, and payment methods."
      />
      <SettingsClient key={settings.settings.updatedAt} data={settings} />
    </>
  );
}
