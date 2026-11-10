'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { CurrentUser } from '@/lib/api-types';
import { changePasswordAction, logoutAllAction, updateProfileAction } from '@/lib/actions/auth';
import { formatDate, type FormatSettings } from '@/lib/format';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ProfileForms({
  user,
  formatSettings,
}: {
  user: CurrentUser;
  formatSettings: FormatSettings;
}) {
  const [name, setName] = React.useState(user.name);
  const [phone, setPhone] = React.useState(user.phone ?? '');
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = React.useState<Record<string, string>>({});
  const [savingProfile, startProfile] = React.useTransition();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [pwError, setPwError] = React.useState<string | null>(null);
  const [pwFieldErrors, setPwFieldErrors] = React.useState<Record<string, string>>({});
  const [savingPw, startPw] = React.useTransition();

  const [logoutAllOpen, setLogoutAllOpen] = React.useState(false);
  const [loggingOutAll, startLogoutAll] = React.useTransition();

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileFieldErrors({});
    startProfile(async () => {
      const res = await updateProfileAction({ name, phone });
      if (res.ok) {
        toast.success('Profile updated');
      } else {
        setProfileError(res.error.message);
        if (res.error.fieldErrors) setProfileFieldErrors(res.error.fieldErrors);
      }
    });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwFieldErrors({});
    if (newPassword !== confirmPassword) {
      setPwFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    startPw(async () => {
      const res = await changePasswordAction({ currentPassword, newPassword });
      if (res.ok) {
        toast.success('Password updated and other sessions revoked');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPwError(res.error.message);
        if (res.error.fieldErrors) setPwFieldErrors(res.error.fieldErrors);
      }
    });
  }

  function handleLogoutAll() {
    startLogoutAll(async () => {
      const res = await logoutAllAction();
      if (res && !res.ok) {
        toast.error(res.error.message);
        setLogoutAllOpen(false);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
          <CardDescription>Update your display name and contact phone number.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <ErrorBanner message={profileError} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user.email} disabled />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <div className="flex h-9 items-center">
                  <Badge variant="secondary">{user.role.name}</Badge>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Full Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingProfile}
                required
              />
              {profileFieldErrors.name ? (
                <p className="text-xs text-destructive">{profileFieldErrors.name}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional phone number"
                disabled={savingProfile}
              />
              {profileFieldErrors.phone ? (
                <p className="text-xs text-destructive">{profileFieldErrors.phone}</p>
              ) : null}
            </div>

            <div className="text-xs text-muted-foreground">
              Last login: {formatDate(user.lastLoginAt, formatSettings, true)}
            </div>

            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save profile'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Changing your password revokes all other active sessions across devices.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <ErrorBanner message={pwError} />

              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={savingPw}
                  required
                />
                {pwFieldErrors.currentPassword ? (
                  <p className="text-xs text-destructive">{pwFieldErrors.currentPassword}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={savingPw}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Min 8 characters, at least one letter and one digit.
                </p>
                {pwFieldErrors.newPassword ? (
                  <p className="text-xs text-destructive">{pwFieldErrors.newPassword}</p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-new-password">Confirm New Password</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={savingPw}
                  required
                />
                {pwFieldErrors.confirmPassword ? (
                  <p className="text-xs text-destructive">{pwFieldErrors.confirmPassword}</p>
                ) : null}
              </div>

              <Button type="submit" disabled={savingPw}>
                {savingPw ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              Sign out from all browsers and devices immediately. You will need to log in again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Effective permissions: <span className="font-medium text-foreground">{user.permissions.length}</span>
            </p>
            <Button variant="destructive" onClick={() => setLogoutAllOpen(true)}>
              Log out all sessions
            </Button>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={logoutAllOpen}
        onOpenChange={setLogoutAllOpen}
        title="Log out of all sessions?"
        description="This immediately signs you out on every browser and device, including this one."
        confirmLabel="Log out everywhere"
        loading={loggingOutAll}
        onConfirm={handleLogoutAll}
      />
    </div>
  );
}
