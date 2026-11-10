import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { requireSession } from '@/lib/auth/session';
import { ProfileForms } from './profile-forms';

export const metadata: Metadata = { title: 'Profile & Security' };

export default async function ProfilePage() {
  const { user, settings } = await requireSession();
  return (
    <>
      <PageHeader
        title="Profile & Security"
        description="Manage your account details, password, and active sessions."
      />
      <ProfileForms user={user} formatSettings={settings.settings} />
    </>
  );
}
