'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authApi, ApiClientError } from '@/services/api-client';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Liên kết xác minh không hợp lệ.');
      return;
    }
    setStatus('loading');
    void authApi
      .verifyEmail(token)
      .then((res) => {
        setStatus('ok');
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof ApiClientError ? err.message : 'Xác minh thất bại');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md space-y-4 p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">Xác minh email</h1>
        {status === 'loading' && <p className="text-sm text-slate-500">Đang xác minh...</p>}
        {status === 'ok' && (
          <>
            <p className="text-sm text-emerald-700">{message || 'Email đã được xác minh.'}</p>
            <Link href="/login">
              <Button className="w-full">Đăng nhập Partner</Button>
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <p className="text-sm text-red-600">{message}</p>
            <Link href="/login" className="text-sm font-medium text-indigo-600 hover:underline">
              Quay lại đăng nhập
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}

export default function VerifyEmailPageClient() {
  return (
    <Suspense fallback={<p className="p-8 text-center text-slate-500">Đang tải...</p>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
