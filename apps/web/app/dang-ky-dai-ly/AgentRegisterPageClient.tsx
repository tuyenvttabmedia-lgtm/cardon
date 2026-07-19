'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authApi, ApiClientError } from '@/services/api-client';
import { getPartnerPortalUrl } from '@/lib/utils';

type AccountType = 'PERSONAL' | 'HOUSEHOLD' | 'COMPANY';

const ACCOUNT_TYPES: { id: AccountType; label: string }[] = [
  { id: 'PERSONAL', label: 'Cá nhân' },
  { id: 'HOUSEHOLD', label: 'Hộ kinh doanh' },
  { id: 'COMPANY', label: 'Doanh nghiệp' },
];

export default function AgentRegisterPageClient() {
  const [accountType, setAccountType] = useState<AccountType>('COMPANY');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; partnerLoginUrl: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptTerms) {
      setError('Bạn cần đồng ý với điều khoản sử dụng');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await authApi.agentRegister({
        accountType,
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword,
        acceptTerms,
      });
      setSuccess({ message: res.message, partnerLoginUrl: res.partnerLoginUrl });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Đăng ký thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="site-container py-10 md:py-14">
        <div className="mx-auto max-w-lg">
          <h1 className="text-2xl font-bold text-cardon-navy md:text-3xl">Đăng ký đại lý B2B</h1>
          <p className="mt-2 text-sm text-cardon-gray md:text-base">
            Tạo tài khoản đối tác CardOn — mua thẻ qua API sau khi hoàn tất KYC.
          </p>

          {success ? (
            <div className="mt-8 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-900">
              <p className="font-semibold">{success.message}</p>
              <p className="mt-2">
                Sau khi xác minh email, đăng nhập tại{' '}
                <a href={success.partnerLoginUrl} className="font-semibold underline">
                  Partner Portal
                </a>
                .
              </p>
            </div>
          ) : (
            <form className="mt-8 space-y-5 rounded-xl border border-cardon-border bg-white p-6 shadow-sm" onSubmit={handleSubmit}>
              <div>
                <p className="text-sm font-medium text-cardon-navy">Loại tài khoản</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {ACCOUNT_TYPES.map((t) => (
                    <label
                      key={t.id}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition ${
                        accountType === t.id
                          ? 'border-cardon-blue bg-cardon-blue/5 text-cardon-blue'
                          : 'border-cardon-border text-cardon-gray hover:border-cardon-blue/40'
                      }`}
                    >
                      <input
                        type="radio"
                        name="accountType"
                        className="sr-only"
                        checked={accountType === t.id}
                        onChange={() => setAccountType(t.id)}
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-cardon-navy">Email</label>
                <Input
                  className="mt-1"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-cardon-navy">Số điện thoại</label>
                <Input
                  className="mt-1"
                  type="tel"
                  placeholder="0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-cardon-navy">Mật khẩu</label>
                  <Input
                    className="mt-1"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-cardon-navy">Xác nhận mật khẩu</label>
                  <Input
                    className="mt-1"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-cardon-gray">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  required
                />
                <span>
                  Tôi đồng ý với{' '}
                  <Link href="/pages/dieu-khoan-su-dung" className="text-cardon-blue hover:underline" target="_blank">
                    Điều khoản
                  </Link>{' '}
                  và{' '}
                  <Link href="/pages/chinh-sach-bao-mat" className="text-cardon-blue hover:underline" target="_blank">
                    Chính sách bảo mật
                  </Link>
                </span>
              </label>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button className="w-full" type="submit" disabled={loading}>
                {loading ? 'Đang đăng ký...' : 'Đăng ký đại lý'}
              </Button>

              <p className="text-center text-sm text-cardon-gray">
                Đã có tài khoản?{' '}
                <a href={getPartnerPortalUrl()} className="font-semibold text-cardon-blue hover:underline">
                  Đăng nhập Partner
                </a>
              </p>
            </form>
          )}
        </div>
      </div>
  );
}
