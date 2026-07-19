'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { adminApi, ApiClientError } from '@/services/api-client';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { ProviderConnectionTest, ProviderDetail, ProviderRuntimeSettings, ProviderAlertSettings } from '@/types/api';

export default function ProviderDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<ProviderDetail | null>(null);
  const [runtime, setRuntime] = useState<ProviderRuntimeSettings>({
    maintenanceMode: false,
    reason: null,
    startAt: null,
    endAt: null,
  });
  const [alertSettings, setAlertSettings] = useState<ProviderAlertSettings | null>(null);
  const [testResult, setTestResult] = useState<ProviderConnectionTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      const [data, alerts] = await Promise.all([
        adminApi.getProviderDetail(params.id),
        adminApi.getProviderAlertSettings(params.id),
      ]);
      setDetail(data);
      setRuntime(data.runtimeSetting);
      setAlertSettings(alerts);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.loadError);
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function runTestConnection() {
    setBusy(true);
    setTestResult(null);
    setError(null);
    try {
      setTestResult(await adminApi.testProviderConnection(params.id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.providers.checkFailed);
    } finally {
      setBusy(false);
    }
  }

  async function saveMaintenance() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await adminApi.updateProviderRuntimeSettings(params.id, runtime);
      setRuntime(saved);
      setMessage(runtime.maintenanceMode ? 'Đã bật chế độ bảo trì NCC' : 'Đã tắt chế độ bảo trì');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không thể cập nhật cài đặt');
    } finally {
      setBusy(false);
    }
  }

  async function saveAlertSettings() {
    if (!alertSettings) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const saved = await adminApi.updateProviderAlertSettings(params.id, alertSettings);
      setAlertSettings(saved);
      setMessage('Đã lưu cài đặt cảnh báo');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Không thể cập nhật cảnh báo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <RequirePermission permission="providers.manage">
      <div className="space-y-6">
        <div>
          <Link href="/providers" className="text-sm text-admin-600 hover:underline">
            ← {vi.providers.title}
          </Link>
          <h1 className="text-2xl font-bold">{detail?.name ?? 'NCC'}</h1>
          <p className="text-sm text-zinc-500">Phase 6O24 · Chi tiết vận hành</p>
        </div>

        {error && <ErrorMessage message={error} />}
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        {detail && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{detail.name}</h2>
                <Badge tone={statusTone(detail.status)} status={detail.status} />
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Mã</dt>
                  <dd>{detail.code}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">{vi.providers.balance}</dt>
                  <dd className="font-semibold">{formatVnd(detail.balance)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Success rate</dt>
                  <dd>{detail.successRate != null ? `${detail.successRate}%` : '—'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">Latency TB</dt>
                  <dd>{detail.avgLatencyMs != null ? `${detail.avgLatencyMs}ms` : '—'}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <Button disabled={busy} onClick={() => void runTestConnection()}>
                  Kiểm tra kết nối
                </Button>
              </div>
              {testResult && (
                <div
                  className={`mt-4 rounded-lg p-4 text-sm ${
                    testResult.success ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'
                  }`}
                >
                  {testResult.success ? (
                    <>
                      <p className="font-semibold">✓ API Connected</p>
                      <p className="mt-2">Balance: {formatVnd(testResult.balance ?? '0')}</p>
                      <p>Response time: {testResult.responseTimeMs}ms</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Kết nối thất bại</p>
                      <p className="mt-1 font-mono text-xs">{testResult.errorCode}</p>
                      <p>{testResult.message}</p>
                      <p className="mt-1 text-xs text-zinc-600">{testResult.responseTimeMs}ms</p>
                    </>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="font-semibold">Tạm dừng NCC (bảo trì)</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Khi bật, hệ thống bỏ qua NCC này khi routing đơn hàng.
              </p>
              <div className="mt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={runtime.maintenanceMode}
                    onChange={(e) =>
                      setRuntime((prev) => ({ ...prev, maintenanceMode: e.target.checked }))
                    }
                  />
                  Bật chế độ bảo trì
                </label>
                <div>
                  <Label>Lý do</Label>
                  <Input
                    className="mt-1"
                    value={runtime.reason ?? ''}
                    onChange={(e) => setRuntime((prev) => ({ ...prev, reason: e.target.value }))}
                    placeholder="Esale bảo trì..."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Bắt đầu</Label>
                    <Input
                      type="datetime-local"
                      className="mt-1"
                      value={runtime.startAt?.slice(0, 16) ?? ''}
                      onChange={(e) =>
                        setRuntime((prev) => ({
                          ...prev,
                          startAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Kết thúc</Label>
                    <Input
                      type="datetime-local"
                      className="mt-1"
                      value={runtime.endAt?.slice(0, 16) ?? ''}
                      onChange={(e) =>
                        setRuntime((prev) => ({
                          ...prev,
                          endAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        }))
                      }
                    />
                  </div>
                </div>
                <Button disabled={busy} variant="secondary" onClick={() => void saveMaintenance()}>
                  Lưu cài đặt
                </Button>
                {runtime.maintenanceMode && (
                  <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                    {detail.name} đang bảo trì — đơn mới sẽ chuyển sang NCC khác nếu có.
                  </p>
                )}
              </div>
            </Card>

            {alertSettings && (
              <Card>
                <h2 className="font-semibold">Alert Settings</h2>
                <p className="mt-1 text-sm text-zinc-500">Cấu hình ngưỡng và kênh cảnh báo NCC.</p>
                <div className="mt-4 space-y-3">
                  <div>
                    <Label>Low balance threshold (VND)</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      value={alertSettings.lowBalanceThreshold}
                      onChange={(e) =>
                        setAlertSettings({
                          ...alertSettings,
                          lowBalanceThreshold: Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={alertSettings.alertAdminEnabled}
                      onChange={(e) =>
                        setAlertSettings({ ...alertSettings, alertAdminEnabled: e.target.checked })
                      }
                    />
                    Admin
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={alertSettings.alertTelegramEnabled}
                      onChange={(e) =>
                        setAlertSettings({ ...alertSettings, alertTelegramEnabled: e.target.checked })
                      }
                    />
                    Telegram
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={alertSettings.alertEmailEnabled}
                      onChange={(e) =>
                        setAlertSettings({ ...alertSettings, alertEmailEnabled: e.target.checked })
                      }
                    />
                    Email
                  </label>
                  <Button disabled={busy} variant="secondary" onClick={() => void saveAlertSettings()}>
                    Lưu cảnh báo
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
