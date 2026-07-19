'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { accountApi, ApiClientError } from '@/services/api-client';
import { clearAuthSession } from '@/lib/auth-storage';
import { useRouter } from 'next/navigation';

export default function ChangePasswordPage() {
  const router = useRouter();
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
      setMessage('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      setTimeout(() => router.push('/login?reset=success'), 1200);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Đổi mật khẩu</h2>
      <p className="mt-1 text-sm text-cardon-gray">
        Nhập mật khẩu hiện tại và mật khẩu mới. Không cần email xác nhận.
        Sau khi đổi, các phiên đăng nhập khác sẽ bị đăng xuất.
      </p>
      <form className="mt-4 max-w-md space-y-4" onSubmit={(e) => void submit(e)}>
        <div>
          <label className="text-sm font-medium">Mật khẩu hiện tại</label>
          <Input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="mt-1" required />
        </div>
        <div>
          <label className="text-sm font-medium">Mật khẩu mới</label>
          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" required minLength={8} />
        </div>
        <div>
          <label className="text-sm font-medium">Xác nhận mật khẩu mới</label>
          <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" required minLength={8} />
        </div>
        {message && <p className="text-sm text-cardon-green">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Đang xử lý...' : 'Đổi mật khẩu'}
        </Button>
      </form>
    </div>
  );
}
