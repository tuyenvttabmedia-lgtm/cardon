'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { authApi } from '@/services/api-client';

export default function ForgotPasswordPageClient() {
  const t = useT();
  const { locale } = useLocale();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setMessage(result.message);
    } catch (err) {
      setError(customerFacingError(locale, err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.forgotTitle')}
      subtitle={t('auth.forgotBody')}
      footer={
        <p className="text-center text-sm">
          <Link href="/login" className="font-semibold text-cardon-blue hover:underline">
            {t('nav.login')}
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-cardon-navy">{t('auth.email')}</label>
          <Input className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? t('auth.sending') : t('auth.sendReset')}
        </Button>
      </form>
    </AuthLayout>
  );
}
