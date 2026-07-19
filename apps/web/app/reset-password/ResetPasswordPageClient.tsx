'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authApi, ApiClientError } from '@/services/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || token.length < 32) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      router.push('/login?reset=success');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Đặt lại mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Liên kết không hợp lệ">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
          <p>Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.</p>
          <Link href="/forgot-password" className="mt-4 inline-block font-semibold text-cardon-blue hover:underline">
            Yêu cầu liên kết mới
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Đặt lại mật khẩu" subtitle="Nhập mật khẩu mới cho tài khoản CardOn của bạn">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-cardon-navy">Mật khẩu mới</label>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-cardon-navy">Xác nhận mật khẩu mới</label>
          <Input
            className="mt-1"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function ResetPasswordPageClient() {
  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
