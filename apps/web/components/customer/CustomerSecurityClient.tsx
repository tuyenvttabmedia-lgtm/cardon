'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CustomerPageHeader, CustomerSkeleton } from '@/components/customer/CustomerUi';
import { customerCenterApi } from '@/lib/customer-portal/api';
import { ApiClientError } from '@/services/api-client';
import { clearAuthSession } from '@/lib/auth-storage';

export default function CustomerSecurityClient() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Array<{ id: string; createdAt: string; expiresAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    void customerCenterApi
      .listSessions()
      .then((r) => setSessions(r.items))
      .finally(() => setLoading(false));
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);
    setPwdError(null);
    try {
      await customerCenterApi.changePassword({ oldPassword, newPassword, confirmPassword });
      clearAuthSession();
      setPwdMessage('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setPwdError(err instanceof ApiClientError ? err.message : 'Đổi mật khẩu thất bại');
    }
  }

  async function revokeOthers() {
    setRevoking(true);
    try {
      const r = await customerCenterApi.revokeOtherSessions();
      setPwdMessage(r.message);
      const refreshed = await customerCenterApi.listSessions();
      setSessions(refreshed.items);
    } finally {
      setRevoking(false);
    }
  }

  return (
    <div className="space-y-8">
      <CustomerPageHeader title="Bảo mật" description="Mật khẩu, phiên đăng nhập và thiết bị." />

      <section className="max-w-lg">
        <h2 className="text-lg font-semibold">Đổi mật khẩu</h2>
        <form className="mt-4 space-y-4" onSubmit={(e) => void changePassword(e)}>
          <Input type="password" placeholder="Mật khẩu hiện tại" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
          <Input type="password" placeholder="Mật khẩu mới" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          <Input type="password" placeholder="Xác nhận mật khẩu mới" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          {pwdMessage && <p className="text-sm text-green-600">{pwdMessage}</p>}
          {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
          <Button type="submit">Đổi mật khẩu</Button>
        </form>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Phiên đăng nhập</h2>
          <Button type="button" variant="secondary" size="sm" disabled={revoking} onClick={() => void revokeOthers()}>
            {revoking ? 'Đang xử lý…' : 'Đăng xuất thiết bị khác'}
          </Button>
        </div>
        {loading ? (
          <CustomerSkeleton rows={2} />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-slate-500">Không có phiên hoạt động.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-700">
                <p className="font-medium">Phiên hoạt động</p>
                <p className="text-slate-500">Bắt đầu: {new Date(s.createdAt).toLocaleString('vi-VN')}</p>
                <p className="text-slate-500">Hết hạn: {new Date(s.expiresAt).toLocaleString('vi-VN')}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
