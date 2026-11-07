'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useDateTime, useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { accountApi } from '@/services/api-client';
import type { AccountProfile } from '@/types/api';

export default function AccountProfilePage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useT();
  const { locale } = useLocale();
  const formatDate = useDateTime();

  useEffect(() => {
    void accountApi
      .getProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p.fullName ?? '');
        setPhone(p.phone ?? '');
      })
      .catch((err) => {
        setError(customerFacingError(locale, err));
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const updated = await accountApi.updateProfile({ fullName, phone });
      setProfile(updated);
      setMessage(t('account.saved'));
    } catch (err) {
      setError(customerFacingError(locale, err));
    }
  }

  if (loading) return <p className="text-cardon-gray">{t('common.loading')}</p>;

  if (!profile) {
    return (
      <div>
        <h2 className="text-lg font-bold text-cardon-navy">{t('account.profile')}</h2>
        <p className="mt-4 text-sm text-red-600">{error ?? t('account.loadFail')}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">{t('account.profile')}</h2>
      <form className="mt-4 max-w-lg space-y-4" onSubmit={(e) => void save(e)}>
        <div>
          <label className="text-sm font-medium">{t('account.username')}</label>
          <Input value={profile.username ?? ''} disabled className="mt-1 bg-gray-50" />
          <p className="mt-1 text-xs text-cardon-gray">{t('account.usernameLocked')}</p>
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input value={profile.email} disabled className="mt-1 bg-gray-50" />
        </div>
        <div>
          <label className="text-sm font-medium">{t('account.fullName')}</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">{t('account.phone')}</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" type="tel" />
        </div>
        <div>
          <label className="text-sm font-medium">{t('account.created')}</label>
          <Input
            value={formatDate(profile.createdAt)}
            disabled
            className="mt-1 bg-gray-50"
          />
        </div>
        {message && <p className="text-sm text-cardon-green">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">{t('account.save')}</Button>
      </form>
    </div>
  );
}
