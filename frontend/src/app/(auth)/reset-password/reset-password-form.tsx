'use client';

import * as React from 'react';
import Link from 'next/link';
import { resetPasswordAction } from '@/lib/actions/auth';
import { ErrorBanner } from '@/components/shared/error-banner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ResetPasswordForm({ initialToken }: { initialToken?: string }) {
  const [token, setToken] = React.useState(initialToken ?? '');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    if (newPassword !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }
    startTransition(async () => {
      const res = await resetPasswordAction({ token, newPassword });
      if (res && !res.ok) {
        setError(res.error.message);
        if (res.error.fieldErrors) setFieldErrors(res.error.fieldErrors);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Reset password</CardTitle>
        <CardDescription>Choose a strong new password for your account.</CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          <ErrorBanner message={error} />

          {!initialToken ? (
            <div className="space-y-1.5">
              <Label htmlFor="token">Reset Token</Label>
              <Input
                id="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                disabled={pending}
                required
              />
              {fieldErrors.token ? <p className="text-xs text-destructive">{fieldErrors.token}</p> : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={pending}
              required
            />
            <p className="text-xs text-muted-foreground">Min 8 characters, at least one letter and one digit.</p>
            {fieldErrors.newPassword ? (
              <p className="text-xs text-destructive">{fieldErrors.newPassword}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={pending}
              required
            />
            {fieldErrors.confirmPassword ? (
              <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
            ) : null}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? 'Resetting…' : 'Set new password'}
          </Button>
          <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
            Back to Sign In
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
