'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import {
  isRetailCustomerRole,
  partnerLoginUrl,
  wrongRetailPortalMessage,
} from '@/lib/retail-auth';
import { safeInternalPath } from '@/lib/safe-redirect';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const redirectTo = safeInternalPath(
    searchParams.get('redirect') || searchParams.get('next'),
    '/',
  );
  const { login, logout } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [partnerHint, setPartnerHint] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setPartnerHint(false);
    try {
      const result = await login(identifier, password);
      if (!isRetailCustomerRole(result.user.role)) {
        logout();
        setError(wrongRetailPortalMessage(result.user.role));
        setPartnerHint(result.user.role === 'AGENT');
        return;
      }
      router.push(redirectTo);
    } catch (err) {
      setError(customerFacingError(locale, err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.loginTitle')}
      formHint={t('auth.loginHint')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <p className="text-center text-sm text-cardon-gray">
          {t('auth.noAccount')}{' '}
          <Link href="/register" className="font-semibold text-cardon-blue hover:underline">
            {t('nav.register')}
          </Link>
        </p>
      }
    >
      {resetSuccess && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {t('auth.resetOk')}
        </p>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-cardon-navy">{t('auth.identifier')}</label>
          <Input
            className="mt-1"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-cardon-navy">{t('auth.password')}</label>
            <Link href="/forgot-password" className="text-xs text-cardon-blue hover:underline">
              {t('auth.forgot')}
            </Link>
          </div>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{error}</p>
            {partnerHint ? (
              <a
                href={partnerLoginUrl()}
                className="inline-block text-sm font-semibold text-cardon-blue hover:underline"
              >
                Đăng nhập Cổng đối tác →
              </a>
            ) : null}
          </div>
        )}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? t('auth.loggingIn') : t('auth.submitLogin')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <LoginForm />
    </Suspense>
  );
}
