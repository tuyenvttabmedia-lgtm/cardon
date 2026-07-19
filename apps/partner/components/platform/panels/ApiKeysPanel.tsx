'use client';

import { useEffect, useState } from 'react';
import { Badge, statusToBadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { agentApi } from '@/services/api-client';
import {
  clearSessionCredentials,
  getSessionCredentials,
} from '@/lib/auth-storage';
import { formatDateTime } from '@/lib/utils';
import type { AgentCredentialsStatus } from '@/types/api';

export default function ApiKeysPanel({ embedded = false }: { embedded?: boolean }) {
  const [credentials, setCredentials] = useState<AgentCredentialsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionCreds, setSessionCreds] = useState(getSessionCredentials());

  useEffect(() => {
    agentApi
      .getCredentials()
      .then(setCredentials)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Không tải được thông tin API'),
      )
      .finally(() => setLoading(false));
  }, []);

  function dismissSessionCredentials() {
    clearSessionCredentials();
    setSessionCreds({});
  }

  if (loading) {
    return <p className="text-slate-500">Đang tải...</p>;
  }

  return (
    <div className={embedded ? 'space-y-6' : 'mx-auto max-w-3xl space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-slate-600">Thông tin xác thực Partner API</p>
        </div>
      )}

      <Card className="border-amber-200 bg-amber-50">
        <p className="text-sm font-medium text-amber-900">Cảnh báo bảo mật</p>
        <p className="mt-1 text-sm text-amber-800">
          Secret key chỉ hiển thị <strong>một lần</strong> khi admin duyệt KYC. CardOn không lưu
          secret key dạng plain text — không thể xem lại sau khi đóng trang.
        </p>
      </Card>

      {sessionCreds.secretKey && (
        <Card className="border-red-300 bg-red-50">
          <p className="font-semibold text-red-800">Credentials một lần — lưu ngay!</p>
          <dl className="mt-4 space-y-3 font-mono text-sm">
            <div>
              <dt className="text-xs uppercase text-red-600">API Key</dt>
              <dd className="break-all">{sessionCreds.apiKey}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-red-600">Secret Key</dt>
              <dd className="break-all">{sessionCreds.secretKey}</dd>
            </div>
          </dl>
          <Button
            className="mt-4"
            variant="secondary"
            size="sm"
            onClick={dismissSessionCredentials}
          >
            Đã lưu — xóa khỏi phiên
          </Button>
        </Card>
      )}

      {error && <p className="text-red-600">{error}</p>}

      {credentials && (
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">Trạng thái:</span>
            <Badge tone={statusToBadgeTone(credentials.status)}>
              {credentials.apiEnabled ? 'Đang hoạt động' : 'Chưa kích hoạt'}
            </Badge>
          </div>

          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">API Key</dt>
              <dd className="mt-1 font-mono text-base">
                {credentials.hasCredentials
                  ? credentials.apiKeyMasked
                  : 'Chưa cấp — cần duyệt KYC'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Secret Key</dt>
              <dd className="mt-1 text-slate-600">
                Không hiển thị — chỉ có khi được cấp lần đầu
              </dd>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Ngày cấp</dt>
                <dd>{formatDateTime(credentials.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Lần dùng API gần nhất</dt>
                <dd>
                  {credentials.lastUsedAt
                    ? formatDateTime(credentials.lastUsedAt)
                    : 'Chưa sử dụng'}
                </dd>
              </div>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
