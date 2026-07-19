'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime } from '@/lib/utils';
import { securityApi, ApiClientError } from '@/services/api-client';
import type { AgentSecurityApiKeys } from '@/types/platform';

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'Đã copy' : label ?? 'Copy'}
    </Button>
  );
}

export default function ApiKeysPage() {
  const { can } = useAgentPlatform();
  const canManage = can('api.manage');
  const [keys, setKeys] = useState<AgentSecurityApiKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oneTime, setOneTime] = useState<{ apiKey?: string; secretKey?: string } | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await securityApi.getApiKeys();
      setKeys(data);
      setLabel(data.label);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function rotate() {
    if (!canManage || !window.confirm('Tạo lại khóa API? Khóa cũ sẽ ngừng hoạt động ngay — cập nhật tích hợp với khóa mới.')) return;
    setBusy(true);
    try {
      const result = await securityApi.rotateApiKey();
      setOneTime({ apiKey: result.apiKey, secretKey: result.secretKey });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ApiPageShell
      title="Khóa API"
      description="Quản lý xác thực Partner API — secret chỉ hiển thị một lần khi tạo/xoay khóa."
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      {oneTime && (
        <Card className="border-red-300 bg-red-50">
          <p className="font-semibold text-red-800">Lưu ngay — secret không hiển thị lại!</p>
          <p className="mt-1 text-sm text-red-700">Khóa cũ đã bị vô hiệu. Cập nhật API Key và Secret trên server của bạn.</p>
          <dl className="mt-3 space-y-3 text-sm">
            {oneTime.apiKey && (
              <div>
                <dt className="text-xs font-medium text-red-800">API Key</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono break-all">
                  {oneTime.apiKey}
                  <CopyButton value={oneTime.apiKey} />
                </dd>
              </div>
            )}
            {oneTime.secretKey && (
              <div>
                <dt className="text-xs font-medium text-red-800">Secret Key</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 font-mono break-all">
                  {oneTime.secretKey}
                  <CopyButton value={oneTime.secretKey} />
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {oneTime.apiKey && oneTime.secretKey && (
              <CopyButton
                value={`API Key: ${oneTime.apiKey}\nSecret: ${oneTime.secretKey}`}
                label="Copy cả hai"
              />
            )}
            <Button className="mt-0" size="sm" variant="secondary" onClick={() => setOneTime(null)}>
              Đã lưu — ẩn
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : keys ? (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={keys.apiEnabled ? 'success' : 'warning'}>{keys.status}</Badge>
            <Badge tone="info">{keys.environment}</Badge>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">API Key (masked)</dt>
              <dd className="mt-1 font-mono">{keys.apiKeyMasked ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Tên khóa</dt>
              <dd className="mt-1">{keys.label}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Ngày tạo</dt>
              <dd>{formatDateTime(keys.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Lần dùng cuối</dt>
              <dd>{keys.lastUsedAt ? formatDateTime(keys.lastUsedAt) : 'Chưa dùng'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">IP cuối</dt>
              <dd>{keys.lastUsedIp ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Quyền API</dt>
              <dd>{keys.permissions.join(', ')}</dd>
            </div>
          </dl>

          {canManage && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Input className="max-w-xs" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Tên khóa" />
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void securityApi.renameApiKey(label).then(() => load())}
              >
                Đổi tên
              </Button>
              <Button disabled={busy} onClick={() => void rotate()}>
                Tạo lại khóa API
              </Button>
              {keys.apiEnabled ? (
                <Button variant="secondary" disabled={busy} onClick={() => void securityApi.disableApiKey().then(() => load())}>
                  Vô hiệu hóa
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => void securityApi.enableApiKey().then(() => load())}>
                  Kích hoạt
                </Button>
              )}
            </div>
          )}
          {!canManage && (
            <p className="text-sm text-amber-700">Chế độ chỉ xem — không thể tạo, xoay hoặc xóa khóa.</p>
          )}
        </Card>
      ) : null}
    </ApiPageShell>
  );
}
