'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { authApi, ApiClientError } from '@/services/api-client';
import { Button } from '@/components/ui/Button';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { status, refresh } = useOnboarding();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status || status.emailVerified) {
    return null;
  }

  async function handleResend() {
    if (!user?.email) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await authApi.resendVerification(user.email);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gửi lại thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <p className="font-semibold">Bước 1 — Xác minh email</p>
      <p className="mt-1 text-amber-900">
        Kiểm tra hộp thư <strong>{user?.email ?? '—'}</strong> và bấm link xác minh. Bạn có thể điền hồ sơ KYC
        bên dưới trong lúc chờ — nút nộp hồ sơ sẽ mở khi email đã xác minh.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={loading || !user?.email} onClick={() => void handleResend()}>
          {loading ? 'Đang gửi...' : 'Gửi lại email xác minh'}
        </Button>
        <button
          type="button"
          className="text-xs font-medium text-amber-900 underline hover:text-amber-950"
          onClick={() => void refresh()}
        >
          Tôi đã xác minh — làm mới
        </button>
      </div>
      {message && <p className="mt-2 text-emerald-800">{message}</p>}
      {error && <p className="mt-2 text-red-700">{error}</p>}
    </div>
  );
}
