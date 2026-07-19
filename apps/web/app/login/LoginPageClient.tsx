'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get('reset') === 'success';
  const redirectTo =
    searchParams.get('redirect') || searchParams.get('next') || '/';
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(identifier, password);
      router.push(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Đăng nhập"
      formHint="Đăng nhập để tiếp tục"
      subtitle="Truy cập tài khoản CardOn để mua thẻ và theo dõi đơn hàng"
      footer={
        <p className="text-center text-sm text-cardon-gray">
          Chưa có tài khoản?{' '}
          <Link href="/register" className="font-semibold text-cardon-blue hover:underline">
            Đăng ký
          </Link>
        </p>
      }
    >
      {resetSuccess && (
        <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Mật khẩu đã được cập nhật. Vui lòng đăng nhập.
        </p>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-cardon-navy">Email hoặc tên đăng nhập</label>
          <Input
            className="mt-1"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-cardon-navy">Mật khẩu</label>
            <Link href="/forgot-password" className="text-xs text-cardon-blue hover:underline">
              Quên mật khẩu?
            </Link>
          </div>
          <Input
            className="mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading}>
          {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPageClient() {
  return (
    <Suspense fallback={<p className="page-shell text-center text-cardon-gray">Đang tải...</p>}>
      <LoginForm />
    </Suspense>
  );
}
