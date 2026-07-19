'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { adminApi, ApiClientError } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { ProviderConnectionTest, ProviderStatus } from '@/types/api';

function healthBadgeTone(status?: string): 'success' | 'warning' | 'danger' | 'default' {
  if (status === 'ONLINE') return 'success';
  if (status === 'SLOW') return 'warning';
  if (status === 'ERROR' || status === 'OFFLINE') return 'danger';
  return 'default';
}

function healthLabel(p: ProviderStatus): string {
  if (p.status === 'MAINTENANCE' || p.status === 'DISABLED') return 'MAINTENANCE';
  return p.healthStatus ?? p.status;
}

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, ProviderConnectionTest>>({});

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setProviders(await adminApi.getProvidersStatus());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function checkBalance(providerId: string) {
    setBusyId(providerId);
    setActionMessage(null);
    setError(null);
    try {
      const result = await adminApi.checkProviderBalance(providerId);
      setActionMessage(`${vi.providers.balance}: ${formatVnd(result.balance)} · ${formatDateTime(result.lastCheckedAt)}`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.checkFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function syncProducts(providerId: string) {
    setBusyId(providerId);
    setActionMessage(null);
    setError(null);
    try {
      const result = await adminApi.syncProviderProducts(providerId);
      const parts = [
        result.newCount != null ? `Mới: ${result.newCount}` : null,
        result.updatedCount != null ? `Cập nhật: ${result.updatedCount}` : null,
        result.disabledCount != null ? `Vô hiệu: ${result.disabledCount}` : null,
      ].filter(Boolean);
      setActionMessage(
        `${vi.providers.syncProducts}: ${result.synced} mục${parts.length ? ` · ${parts.join(' · ')}` : ''}${result.message ? ` — ${result.message}` : ''}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.syncFailed);
    } finally {
      setBusyId(null);
    }
  }

  async function testConnection(providerId: string) {
    setBusyId(providerId);
    setError(null);
    try {
      const result = await adminApi.testProviderConnection(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
      setActionMessage(
        result.success
          ? `Kết nối OK · ${result.responseTimeMs ?? '—'}ms`
          : `Kết nối lỗi: ${result.message ?? 'Không xác định'}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.checkFailed);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <RequirePermission permission="providers.manage">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{vi.providers.title}</h1>
            <p className="text-sm text-zinc-500">Giám sát nhà cung cấp · CardOn 6O25.2</p>
          </div>
          <Button variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? vi.app.loading : vi.app.refresh}
          </Button>
        </div>
        {error && <ErrorMessage message={error} />}
        {actionMessage && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{actionMessage}</p>}
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((p) => {
            const label = healthLabel(p);
            const errorRate =
              p.errorRate != null
                ? `${p.errorRate}%`
                : p.todaySuccess != null || p.todayFailed != null
                  ? `${Math.round(((p.todayFailed ?? 0) / Math.max((p.todaySuccess ?? 0) + (p.todayFailed ?? 0), 1)) * 100)}%`
                  : '—';

            return (
              <Card key={p.id} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{p.name}</h2>
                    <p className="text-sm text-zinc-500 font-mono">{p.code}</p>
                  </div>
                  <Badge tone={healthBadgeTone(label)}>{label}</Badge>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <dt className="text-xs text-zinc-500">{vi.providers.balance}</dt>
                    <dd className="mt-1 text-lg font-bold">{formatVnd(p.balance)}</dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <dt className="text-xs text-zinc-500">Thành công hôm nay</dt>
                    <dd className="mt-1 text-lg font-bold text-emerald-700">{p.todaySuccess ?? 0}</dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <dt className="text-xs text-zinc-500">Tỷ lệ lỗi</dt>
                    <dd className="mt-1 text-lg font-bold">{errorRate}</dd>
                  </div>
                  <div className="rounded-lg bg-zinc-50 p-3">
                    <dt className="text-xs text-zinc-500">Response time</dt>
                    <dd className="mt-1 text-lg font-bold">{p.avgLatencyMs != null ? `${p.avgLatencyMs}ms` : '—'}</dd>
                  </div>
                </dl>
                {p.lastError?.message && (
                  <p className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-800">
                    Lỗi gần nhất: {p.lastError.message} · {formatDateTime(p.lastError.at)}
                  </p>
                )}
                {p.lowBalanceWarning && (
                  <p className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                    {vi.providers.lowBalance} (&lt; {formatVnd(p.threshold)})
                  </p>
                )}
                {testResults[p.id] && (
                  <p className="mt-3 text-xs text-zinc-500">
                    Kiểm tra: {testResults[p.id].success ? 'OK' : 'Lỗi'} · {testResults[p.id].responseTimeMs ?? '—'}ms
                  </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
                  <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => void testConnection(p.id)}>
                    Kiểm tra kết nối
                  </Button>
                  <Button size="sm" disabled={busyId === p.id} onClick={() => void checkBalance(p.id)}>
                    Đồng bộ số dư
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busyId === p.id} onClick={() => void syncProducts(p.id)}>
                    Đồng bộ sản phẩm
                  </Button>
                  <Link href={`/providers/${p.id}`}>
                    <Button size="sm" variant="ghost">
                      Bảo trì
                    </Button>
                  </Link>
                  <Link href={`/providers/${p.id}`} className="ml-auto text-sm text-admin-600 hover:underline">
                    Chi tiết →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </RequirePermission>
  );
}
