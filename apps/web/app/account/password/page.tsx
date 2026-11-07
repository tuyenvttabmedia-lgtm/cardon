'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { accountApi } from '@/services/api-client';
import { clearAuthSession } from '@/lib/auth-storage';
import { useRouter } from 'next/navigation';

export default function ChangePasswordPage() {
  const router = useRouter();
  const t = useT();
  const { locale } = useLocale();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      await accountApi.changePassword({ oldPassword, newPassword, confirmPassword });
      clearAuthSession();
      setMessage(t('account.passwordOk'));
      setTimeout(() => router.push('/login?reset=success'), 1200);
    } catch (err) {
      setError(customerFacingError(locale, err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">{t('account.passwordTitle')}</h2>
      <p className="mt-1 text-sm text-cardon-gray">{t('account.passwordBody')}</p>
      <form className="mt-4 max-w-md space-y-4" onSubmit={(e) => void submit(e)}>
        <div>
          <label className="text-sm font-medium">{t('account.currentPassword')}</label>
          <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="mt-1" required />
        </div>
        <div>
          <label className="text-sm font-medium">{t('account.newPassword')}</label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" required minLength={8} />
        </div>
        <div>
          <label className="text-sm font-medium">{t('account.confirmNew')}</label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" required minLength={8} />
        </div>
        {message && <p className="text-sm text-cardon-green">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? t('checkout.processing') : t('account.passwordTitle')}
        </Button>
      </form>
    </div>
  );
}
