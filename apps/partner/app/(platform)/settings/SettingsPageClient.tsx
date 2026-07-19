'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { useAgentProfile } from '@/hooks/useAuth';
import { agentStatusLabel, kycStatusLabel } from '@/lib/utils';
import { clearAuthSession } from '@/lib/auth-storage';
import { agentApi, ApiClientError } from '@/services/api-client';

export default function SettingsPageClient() {
  const router = useRouter();
  const { profile } = useAgentProfile();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdMessage, setPwdMessage] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdMessage(null);
    setPwdError(null);
    setSubmitting(true);
    try {
      await agentApi.changePassword({ oldPassword, newPassword, confirmPassword });
      clearAuthSession();
      setPwdMessage('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      setTimeout(() => router.push('/login'), 1200);
    } catch (err) {
      setPwdError(err instanceof ApiClientError ? err.message : 'Đổi mật khẩu thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PlatformSection title="Tài khoản" description="Thông tin doanh nghiệp, KYC, bảo mật và liên hệ API.">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <p className="font-semibold text-slate-900">Thông tin doanh nghiệp</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Công ty</dt>
              <dd className="font-medium">{profile?.companyName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Trạng thái</dt>
              <dd className="font-medium">{profile ? agentStatusLabel(profile.status) : '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">KYC</dt>
              <dd className="font-medium">{kycStatusLabel(profile?.kyc?.status)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email liên hệ</dt>
              <dd className="font-medium">{profile?.contactEmail ?? '—'}</dd>
            </div>
          </dl>
          <Link href="/account/kyc" className="inline-block text-sm font-medium text-indigo-600 hover:underline">
            Quản lý KYC →
          </Link>
        </Card>

        <Card className="space-y-3">
          <p className="font-semibold text-slate-900">Webhook URL</p>
          <p className="text-sm text-slate-500">Cấu hình tại API Center → Webhook.</p>
          <Link href="/api/webhook" className="text-sm font-medium text-indigo-600 hover:underline">
            Mở cấu hình Webhook →
          </Link>
        </Card>

        <Card id="doi-mat-khau" className="space-y-4 lg:col-span-2 scroll-mt-24">
          <div>
            <p className="font-semibold text-slate-900">Đổi mật khẩu</p>
            <p className="mt-1 text-sm text-slate-500">Nhập mật khẩu hiện tại và mật khẩu mới. Không cần email xác nhận.</p>
          </div>
          <form className="grid max-w-lg gap-3" onSubmit={(e) => void changePassword(e)}>
            <Input
              type="password"
              placeholder="Mật khẩu hiện tại"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Input
              type="password"
              placeholder="Mật khẩu mới (tối thiểu 8 ký tự)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            <Input
              type="password"
              placeholder="Xác nhận mật khẩu mới"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
            {pwdMessage && <p className="text-sm text-green-600">{pwdMessage}</p>}
            {pwdError && <p className="text-sm text-red-600">{pwdError}</p>}
            <div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Đang xử lý…' : 'Đổi mật khẩu'}
              </Button>
            </div>
          </form>
          <p className="text-xs text-slate-400">Xác thực hai lớp (2FA) — sắp phát triển.</p>
        </Card>

        <Card>
          <p className="font-semibold text-slate-900">Liên hệ API</p>
          <p className="mt-2 text-sm text-slate-500">Hỗ trợ kỹ thuật tích hợp: support@cardon.vn</p>
        </Card>
      </div>
    </PlatformSection>
  );
}
