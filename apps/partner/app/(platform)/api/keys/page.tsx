'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAgentPlatform } from '@/hooks/useAgentPlatform';
import { formatDateTime, formatVnd } from '@/lib/utils';
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

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PENDING_ADMIN' || status === 'MISSING') return 'warning';
  if (status === 'DISABLED') return 'danger';
  return 'default';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: 'Đang dùng',
    MISSING: 'Chưa có khóa',
    PENDING_ADMIN: 'Chờ Admin bật',
    DISABLED: 'Đã tắt',
  };
  return map[status] ?? status;
}

export default function ApiKeysPage() {
  const { can } = useAgentPlatform();
  const canManage = can('api.manage');
  const [keys, setKeys] = useState<AgentSecurityApiKeys | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oneTime, setOneTime] = useState<{
    environment: string;
    apiKey?: string;
    secretKey?: string;
    message?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await securityApi.getApiKeys();
      setKeys(data);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function issueOrRotateSandbox() {
    if (!canManage) return;
    const has = keys?.sandbox.hasCredentials;
    const ok = window.confirm(
      has
        ? 'Xoay khóa Sandbox? Khóa ak_test_ cũ sẽ ngừng ngay — cập nhật tích hợp.'
        : 'Tạo khóa Sandbox (ak_test_)? Secret chỉ hiện một lần.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await securityApi.rotateApiKey('SANDBOX');
      setOneTime({
        environment: result.environment ?? 'SANDBOX',
        apiKey: result.apiKey,
        secretKey: result.secretKey,
        message: result.message,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function issueOrRotateLive() {
    if (!canManage || !keys?.liveApiEnabled) return;
    const has = keys.live.hasCredentials;
    const ok = window.confirm(
      has
        ? 'Xoay khóa Live? Khóa ak_live_ cũ sẽ ngừng ngay — cập nhật tích hợp production.'
        : 'Tạo khóa Live (ak_live_)? Secret chỉ hiện một lần.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const result = await securityApi.rotateApiKey('PRODUCTION');
      setOneTime({
        environment: result.environment ?? 'PRODUCTION',
        apiKey: result.apiKey,
        secretKey: result.secretKey,
        message: result.message,
      });
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
      description="Hai môi trường tách biệt: Sandbox (test) và Live (production). Không dùng chung một key."
    >
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="border-slate-200 bg-slate-50 text-sm text-slate-700">
        <p className="font-medium text-slate-900">Luồng khuyến nghị</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Tạo / dùng khóa <code className="rounded bg-white px-1">ak_test_</code> (Sandbox) để tích hợp &amp; UAT</li>
          <li>Cấu hình webhook, IP whitelist, chạy buy sandbox đến khi ổn</li>
          <li>Nhờ Admin bật Live API → nhận <code className="rounded bg-white px-1">ak_live_</code></li>
        </ol>
      </Card>

      {oneTime && (
        <Card className="border-red-300 bg-red-50">
          <p className="font-semibold text-red-800">
            Lưu ngay — Secret {oneTime.environment} không hiện lại!
          </p>
          {oneTime.message && <p className="mt-1 text-sm text-red-700">{oneTime.message}</p>}
          <dl className="mt-3 space-y-3 text-sm">
            {oneTime.apiKey && (
              <div>
                <dt className="text-xs font-medium text-red-800">API Key</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono">
                  {oneTime.apiKey}
                  <CopyButton value={oneTime.apiKey} />
                </dd>
              </div>
            )}
            {oneTime.secretKey && (
              <div>
                <dt className="text-xs font-medium text-red-800">Secret Key</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono">
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
            <Button size="sm" variant="secondary" onClick={() => setOneTime(null)}>
              Đã lưu — ẩn
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : keys ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">API tổng:</span>
            <Badge tone={keys.apiEnabled ? 'success' : 'danger'}>
              {keys.apiEnabled ? 'Đang bật' : 'Đã tắt'}
            </Badge>
            {canManage &&
              (keys.apiEnabled ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void securityApi.disableApiKey().then(() => load())}
                >
                  Tắt toàn bộ API
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void securityApi.enableApiKey().then(() => load())}
                >
                  Bật lại API
                </Button>
              ))}
            <span className="text-xs text-slate-400">
              Dùng lần cuối:{' '}
              {keys.lastUsedAt ? formatDateTime(keys.lastUsedAt) : 'Chưa dùng'}
              {keys.lastUsedIp ? ` · IP ${keys.lastUsedIp}` : ''}
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Sandbox */}
            <Card className="space-y-4 border-emerald-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Sandbox</h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{keys.sandbox.prefix}…</p>
                </div>
                <Badge tone={statusTone(keys.sandbox.status)}>
                  {statusLabel(keys.sandbox.status)}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{keys.sandbox.hint}</p>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">API Key</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {keys.sandbox.apiKeyMasked ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Hạn mức sandbox</dt>
                  <dd className="mt-1 font-medium">
                    {formatVnd(keys.sandbox.balance ?? '0')}
                    <span className="ml-1 text-xs font-normal text-slate-400">
                      (hold {formatVnd(keys.sandbox.heldBalance ?? '0')})
                    </span>
                  </dd>
                </div>
              </dl>
              {canManage && (
                <Button disabled={busy} onClick={() => void issueOrRotateSandbox()}>
                  {keys.sandbox.hasCredentials ? 'Xoay khóa Sandbox' : 'Tạo khóa Sandbox'}
                </Button>
              )}
            </Card>

            {/* Live */}
            <Card className="space-y-4 border-amber-200">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Live (Production)</h2>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{keys.live.prefix}…</p>
                </div>
                <Badge tone={statusTone(keys.live.status)}>
                  {statusLabel(keys.live.status)}
                </Badge>
              </div>
              <p className="text-sm text-slate-600">{keys.live.hint}</p>
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">API Key</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {keys.live.apiKeyMasked ?? '—'}
                  </dd>
                </div>
              </dl>
              {!keys.liveApiEnabled && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Sau UAT sandbox, nhờ Admin bật Live API. Sau đó bạn có thể tạo / xoay{' '}
                  <code>ak_live_</code> tại đây (secret chỉ hiện một lần).
                </p>
              )}
              {canManage && keys.liveApiEnabled && (
                <Button disabled={busy} onClick={() => void issueOrRotateLive()}>
                  {keys.live.hasCredentials ? 'Xoay khóa Live' : 'Tạo khóa Live'}
                </Button>
              )}
            </Card>
          </div>

          {!canManage && (
            <p className="text-sm text-amber-700">Chế độ chỉ xem — không tạo hoặc xoay khóa.</p>
          )}
        </div>
      ) : null}
    </ApiPageShell>
  );
}
