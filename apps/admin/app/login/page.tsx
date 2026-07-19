'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { useAuth } from '@/hooks/useAuth';
import { defaultRouteForRole } from '@/lib/permissions';
import { ApiClientError } from '@/services/api-client';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (authLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">
        Đang tải...
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(email, password);
      router.replace(defaultRouteForRole(result.user.role, result.user.permissions ?? []));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.login.failed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold">{vi.app.name}</h1>
        <p className="mt-2 text-sm text-zinc-600">{vi.login.subtitle}</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email">{vi.login.email}</Label>
            <Input id="email" type="email" className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="password">{vi.login.password}</Label>
            <Input id="password" type="password" className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? vi.login.submitting : vi.login.submit}
          </Button>
        </form>
      </div>
    </div>
  );
}
