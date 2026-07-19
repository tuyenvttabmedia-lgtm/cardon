'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { accountApi, ApiClientError } from '@/services/api-client';
import type { AccountProfile } from '@/types/api';

export default function AccountProfilePage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void accountApi.getProfile().then((p) => {
      setProfile(p);
      setFullName(p.fullName ?? '');
      setPhone(p.phone ?? '');
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    try {
      const updated = await accountApi.updateProfile({ fullName, phone });
      setProfile(updated);
      setMessage('Đã cập nhật thông tin tài khoản');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Lỗi cập nhật');
    }
  }

  if (!profile) return <p className="text-cardon-gray">Đang tải...</p>;

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Thông tin tài khoản</h2>
      <form className="mt-4 max-w-lg space-y-4" onSubmit={(e) => void save(e)}>
        <div>
          <label className="text-sm font-medium">Tên đăng nhập</label>
          <Input value={profile.username ?? ''} disabled className="mt-1 bg-gray-50" />
          <p className="mt-1 text-xs text-cardon-gray">Không thể thay đổi tên đăng nhập</p>
        </div>
        <div>
          <label className="text-sm font-medium">Email</label>
          <Input value={profile.email} disabled className="mt-1 bg-gray-50" />
        </div>
        <div>
          <label className="text-sm font-medium">Họ và tên</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-sm font-medium">Số điện thoại</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" type="tel" />
        </div>
        <div>
          <label className="text-sm font-medium">Ngày tạo tài khoản</label>
          <Input
            value={new Date(profile.createdAt).toLocaleDateString('vi-VN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            disabled
            className="mt-1 bg-gray-50"
          />
        </div>
        {message && <p className="text-sm text-cardon-green">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit">Lưu thay đổi</Button>
      </form>
    </div>
  );
}
