'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { clearAuthSession } from '@/lib/auth-storage';
import { authApi, ApiClientError } from '@/services/api-client';

export default function AccountPage() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setSubmitting(true);
    try {
      await authApi.changePassword({ oldPassword, newPassword, confirmPassword });
      clearAuthSession();
      setMessage(vi.account.changePasswordSuccess);
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.account.changePasswordFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold text-zinc-900">{vi.account.title}</h1>
      <p className="mt-1 text-sm text-zinc-600">{vi.account.changePasswordHint}</p>

      <form className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6" onSubmit={(e) => void handleSubmit(e)}>
        <h2 className="text-lg font-semibold text-zinc-900">{vi.account.changePassword}</h2>
        <div>
          <Label htmlFor="oldPassword">{vi.account.oldPassword}</Label>
          <Input
            id="oldPassword"
            type="password"
            className="mt-1"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <div>
          <Label htmlFor="newPassword">{vi.account.newPassword}</Label>
          <Input
            id="newPassword"
            type="password"
            className="mt-1"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <Label htmlFor="confirmPassword">{vi.account.confirmPassword}</Label>
          <Input
            id="confirmPassword"
            type="password"
            className="mt-1"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? vi.account.submitting : vi.account.changePassword}
        </Button>
      </form>
    </div>
  );
}
