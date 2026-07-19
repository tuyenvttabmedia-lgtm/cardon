'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { customerCenterApi } from '@/lib/customer-portal/api';
import { ApiClientError } from '@/services/api-client';
import type { AccountProfile } from '@/types/api';

export default function CustomerProfileClient() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void customerCenterApi
      .getProfile()
      .then((p) => {
        setProfile(p);
        setFullName(p.fullName ?? '');
        setPhone(p.phone ?? '');
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const updated = await customerCenterApi.updateProfile({ fullName, phone });
      setProfile(updated);
      setMessage('Đã cập nhật thông tin tài khoản');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Lỗi cập nhật');
    }
  }

  if (loading) return <CustomerSkeleton rows={3} />;

  return (
    <div>
      <CustomerPageHeader title="Tài khoản" description="Thông tin cá nhân và liên hệ." />

      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-xl font-bold text-sky-700">
          {(profile?.fullName ?? profile?.email ?? '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-white">{profile?.fullName ?? profile?.username}</p>
          <p className="text-sm text-slate-500">{profile?.email}</p>
        </div>
      </div>

      <form className="max-w-lg space-y-4" onSubmit={(e) => void save(e)}>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input value={profile?.email ?? ''} disabled className="mt-1 bg-slate-50" />
        </div>
        <div>
          <label className="text-sm font-medium">Họ và tên</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">Số điện thoại</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="mt-1" />
        </div>
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Xác thực hai lớp (2FA) — sắp phát triển.
        </div>
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">Lưu thay đổi</Button>
      </form>
    </div>
  );
}
