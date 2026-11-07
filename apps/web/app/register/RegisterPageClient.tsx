'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Toast } from '@/components/ui/Toast';
import { useAuth } from '@/hooks/useAuth';
import type { RegisterPayload } from '@/types/api';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { safeInternalPath } from '@/lib/safe-redirect';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeInternalPath(searchParams.get('redirect'), '/');
  const { register } = useAuth();
  const t = useT();
  const { locale } = useLocale();
  const [form, setForm] = useState<RegisterPayload>({
    username: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    identityNumber: '',
    acceptTerms: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.acceptTerms) {
      setError(t('auth.needTerms'));
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await register({
        ...form,
        identityNumber: form.identityNumber?.trim() || undefined,
      });
      setToast(t('auth.registerOk'));
      setTimeout(() => router.push(redirectTo || '/tai-khoan'), 800);
    } catch (err) {
      setError(customerFacingError(locale, err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <AuthLayout
        title={t('auth.registerTitle')}
        subtitle={t('auth.registerSubtitle')}
        footer={
          <p className="text-center text-sm text-cardon-gray">
            {t('auth.hasAccount')}{' '}
            <Link
              href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
              className="font-semibold text-cardon-blue hover:underline"
            >
              {t('nav.login')}
            </Link>
          </p>
        }
      >
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-cardon-navy">{t('auth.username')}</label>
              <Input
                className="mt-1"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
                minLength={3}
                autoComplete="username"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-cardon-navy">{t('auth.fullName')}</label>
              <Input
                className="mt-1"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                required
                autoComplete="name"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-cardon-navy">{t('auth.email')}</label>
            <Input
              className="mt-1"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-cardon-navy">{t('auth.phone')}</label>
            <Input
              className="mt-1"
              type="tel"
              placeholder="0912345678"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-cardon-navy">{t('auth.identity')}</label>
            <Input
              className="mt-1"
              inputMode="numeric"
              value={form.identityNumber ?? ''}
              onChange={(e) => setForm({ ...form, identityNumber: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-cardon-navy">{t('auth.password')}</label>
              <Input
                className="mt-1"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-cardon-navy">{t('auth.confirmPassword')}</label>
              <Input
                className="mt-1"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-cardon-gray">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.acceptTerms}
              onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
              required
            />
            <span>
              {t('auth.accept')}{' '}
              <Link href="/dieu-khoan-su-dung" className="text-cardon-blue hover:underline" target="_blank">
                {t('auth.terms')}
              </Link>{' '}
              {t('auth.and')}{' '}
              <Link href="/chinh-sach-bao-mat" className="text-cardon-blue hover:underline" target="_blank">
                {t('auth.privacy')}
              </Link>
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? t('auth.registering') : t('auth.register')}
          </Button>
        </form>
      </AuthLayout>
    </>
  );
}

export default function RegisterPageClient() {
  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">…</p>}>
      <RegisterForm />
    </Suspense>
  );
}
