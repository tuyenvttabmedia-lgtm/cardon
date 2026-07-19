'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { agentApi, ApiClientError } from '@/services/api-client';
import { getCustomerSiteUrl } from '@/lib/utils';
import { getOnboardingRedirectPath, isFullyOnboarded } from '@/lib/onboarding-gate';

export default function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const nextPath = searchParams.get('next') || '/dashboard';

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace(nextPath.startsWith('/') ? nextPath : '/dashboard');
    }
  }, [loading, isAuthenticated, router, nextPath]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      let target = nextPath.startsWith('/') ? nextPath : '/dashboard';
      try {
        const onboarding = await agentApi.getOnboardingStatus();
        if (!isFullyOnboarded(onboarding)) {
          target = getOnboardingRedirectPath(onboarding);
        }
      } catch {
        // keep default target
      }
      window.location.assign(target);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-partner-900 via-partner-700 to-indigo-800 text-white">
        Đang chuyển hướng...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-partner-900 via-partner-700 to-indigo-800 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">CardOn Agent Platform</h1>
        <p className="mt-2 text-sm text-slate-600">Cổng đại lý B2B — API-first</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              className="mt-1"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="password">Mật khẩu</Label>
            <Input
              id="password"
              type="password"
              className="mt-1"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={submitting}>
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Khách hàng cá nhân?{' '}
          <Link href={getCustomerSiteUrl()} className="text-partner-600 hover:underline">
            CardOn.vn
          </Link>
        </p>
      </div>
    </div>
  );
}
