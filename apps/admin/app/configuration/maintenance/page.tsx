'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Textarea } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { maintenanceCenterApi, ApiClientError } from '@/services/api-client';
import type { MaintenanceConfig, MaintenanceDashboard, MaintenanceMode } from '@/types/api';
import { useAuth } from '@/hooks/useAuth';

const MODES: MaintenanceMode[] = ['OFF', 'READ_ONLY', 'MAINTENANCE', 'EMERGENCY'];

const MODULE_KEYS = [
  'products',
  'orders',
  'payment',
  'topup',
  'data',
  'game_cards',
  'marketing',
  'partner_api',
  'customer_api',
  'public_api',
] as const;

function StatusBadge({ active, mode }: { active: boolean; mode: MaintenanceMode }) {
  if (!active) {
    return (
      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">
        {vi.configuration.maintenanceOff}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
      {vi.configuration.maintenanceActive} · {mode}
    </span>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'danger' | 'neutral' }) {
  return (
    <Card className={cn('text-sm', tone === 'danger' && 'border-red-200 bg-red-50/40')}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-2 font-semibold text-zinc-900">{value}</div>
    </Card>
  );
}

export default function ConfigurationMaintenancePage() {
  const { can } = useAuth();
  const canManage = can('maintenance.manage');
  const [dashboard, setDashboard] = useState<MaintenanceDashboard | null>(null);
  const [form, setForm] = useState<MaintenanceConfig | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ desktop?: string; mobile?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await maintenanceCenterApi.getDashboard();
      setDashboard(data);
      setForm(data.config);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.configuration.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const affectedModules = useMemo(() => {
    if (!form?.modules) return dashboard?.summary.affectedModules ?? [];
    return MODULE_KEYS.filter((k) => form.modules?.[k] === false);
  }, [form?.modules, dashboard?.summary.affectedModules]);

  async function runPreview() {
    if (!form) return;
    try {
      const res = await maintenanceCenterApi.preview({ mode: form.mode, banner: form.banner });
      setPreview(res.preview as { desktop?: string; mobile?: string });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    }
  }

  async function saveMaintenance() {
    if (!form || !canManage) return;
    if (!password.trim()) {
      setError(vi.configuration.maintenancePasswordRequired);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await maintenanceCenterApi.update({ ...form, password });
      setDashboard(data);
      setForm(data.config);
      setPassword('');
      setMessage(vi.configuration.maintenanceSaved);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  async function saveSchedule() {
    if (!form?.schedule || !canManage) return;
    if (!password.trim()) {
      setError(vi.configuration.maintenancePasswordRequired);
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const data = await maintenanceCenterApi.applySchedule({ ...form.schedule, password });
      setDashboard(data);
      setForm(data.config);
      setPassword('');
      setMessage(vi.configuration.maintenanceScheduleSaved);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }

  const summary = dashboard?.summary;
  const mode = form?.mode ?? 'OFF';
  const active = summary?.active ?? mode !== 'OFF';

  return (
    <RequirePermission permission="maintenance.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            <StatusBadge active={active} mode={mode} />
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>
              ↻
            </Button>
          </div>
        </div>

        <ConfigurationAuditBar module="maintenance" />

        <Card className="border-blue-200 bg-blue-50/50">
          <h2 className="text-base font-semibold text-zinc-900">{vi.configuration.maintenanceQuickGuideTitle}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700">{vi.configuration.maintenanceQuickGuideBody}</p>
          {form && canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setForm({ ...form, mode: 'OFF' })}
              >
                {vi.configuration.maintenanceTurnOff}
              </Button>
              <Button
                type="button"
                onClick={() => setForm({ ...form, mode: 'MAINTENANCE' })}
              >
                {vi.configuration.maintenanceTurnOn}
              </Button>
            </div>
          )}
        </Card>

        {error && <ErrorMessage message={error} />}
        {message && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>
        )}

        {summary && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryCard label={vi.configuration.maintenanceStatus} value={summary.status} tone={active ? 'danger' : 'neutral'} />
            <SummaryCard label={vi.configuration.maintenanceReadOnly} value={summary.readOnly ? vi.configuration.yes : vi.configuration.no} />
            <SummaryCard
              label={vi.configuration.maintenanceAffectedModules}
              value={affectedModules.length ? affectedModules.join(', ') : '—'}
            />
            <SummaryCard label={vi.configuration.maintenanceCurrentBanner} value={form?.banner?.title ?? '—'} />
            <SummaryCard
              label={vi.configuration.maintenanceScheduledTasks}
              value={summary.scheduledTasks.length ? summary.scheduledTasks.length : '—'}
            />
            <SummaryCard label={vi.configuration.maintenanceHistory} value={summary.historyCount} />
          </div>
        )}

        {form && (
          <>
            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">{vi.configuration.maintenanceMode}</h2>
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!canManage}
                    onClick={() => setForm({ ...form, mode: m })}
                    className={cn(
                      'rounded-lg border px-4 py-2 text-sm font-medium transition',
                      form.mode === m
                        ? 'border-admin-600 bg-admin-600 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-admin-300',
                      !canManage && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-medium text-zinc-700">{vi.configuration.maintenanceReason}</label>
              <Textarea
                value={form.reason ?? ''}
                disabled={!canManage}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                rows={2}
              />
            </Card>

            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">{vi.configuration.maintenanceModules}</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {MODULE_KEYS.map((key) => {
                  const enabled = form.modules?.[key] !== false;
                  return (
                    <label key={key} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                      <span className="font-medium capitalize text-zinc-800">{key.replace(/_/g, ' ')}</span>
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={!canManage}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            modules: { ...form.modules, [key]: e.target.checked },
                          })
                        }
                      />
                    </label>
                  );
                })}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{vi.configuration.maintenanceBanner}</h2>
                <Input
                  placeholder="Title"
                  value={form.banner?.title ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, banner: { ...form.banner, title: e.target.value } })}
                />
                <Textarea
                  placeholder="Description"
                  value={form.banner?.description ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, banner: { ...form.banner, description: e.target.value } })}
                  rows={3}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    placeholder="Icon"
                    value={form.banner?.icon ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, banner: { ...form.banner, icon: e.target.value } })}
                  />
                  <Input
                    placeholder="Color"
                    value={form.banner?.color ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, banner: { ...form.banner, color: e.target.value } })}
                  />
                  <Input
                    placeholder="Button text"
                    value={form.banner?.buttonText ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, banner: { ...form.banner, buttonText: e.target.value } })}
                  />
                  <Input
                    placeholder="Button link"
                    value={form.banner?.buttonLink ?? ''}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, banner: { ...form.banner, buttonLink: e.target.value } })}
                  />
                </div>
                <Button type="button" variant="secondary" onClick={() => void runPreview()}>
                  {vi.configuration.maintenancePreview}
                </Button>
                {preview && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border p-4" style={{ borderColor: form.banner?.color ?? '#dc2626' }}>
                      <p className="text-xs text-zinc-500">Desktop</p>
                      <p className="mt-1 font-semibold">{preview.desktop}</p>
                      <p className="mt-1 text-sm text-zinc-600">{form.banner?.description}</p>
                    </div>
                    <div className="rounded-xl border p-4">
                      <p className="text-xs text-zinc-500">Mobile</p>
                      <p className="mt-1 text-sm">{preview.mobile}</p>
                    </div>
                  </div>
                )}
              </Card>

              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{vi.configuration.maintenanceSchedule}</h2>
                <Input
                  type="datetime-local"
                  disabled={!canManage}
                  value={form.schedule?.startAt?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: { ...form.schedule, startAt: e.target.value ? new Date(e.target.value).toISOString() : null },
                    })
                  }
                />
                <Input
                  type="datetime-local"
                  disabled={!canManage}
                  value={form.schedule?.endAt?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      schedule: { ...form.schedule, endAt: e.target.value ? new Date(e.target.value).toISOString() : null },
                    })
                  }
                />
                <Input
                  placeholder={vi.configuration.maintenanceTimezone}
                  value={form.schedule?.timezone ?? 'Asia/Ho_Chi_Minh'}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, timezone: e.target.value } })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.schedule?.autoEnable ?? false}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, autoEnable: e.target.checked } })}
                  />
                  {vi.configuration.maintenanceAutoEnable}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.schedule?.autoDisable ?? false}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, schedule: { ...form.schedule, autoDisable: e.target.checked } })}
                  />
                  {vi.configuration.maintenanceAutoDisable}
                </label>
                {canManage && (
                  <Button type="button" variant="secondary" disabled={loading} onClick={() => void saveSchedule()}>
                    {vi.configuration.maintenanceScheduleSave}
                  </Button>
                )}
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{vi.configuration.maintenancePartner}</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.partner?.allowDuringMaintenance ?? false}
                    disabled={!canManage}
                    onChange={(e) => setForm({ ...form, partner: { ...form.partner, allowDuringMaintenance: e.target.checked } })}
                  />
                  {vi.configuration.maintenanceAllowPartner}
                </label>
                <Input
                  placeholder={vi.configuration.maintenanceWhitelist}
                  value={(form.partner?.whitelistAgentIds ?? []).join(', ')}
                  disabled={!canManage}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      partner: {
                        ...form.partner,
                        whitelistAgentIds: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </Card>

              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">{vi.configuration.maintenanceCustomerPage}</h2>
                <Input
                  placeholder={vi.configuration.maintenanceSupportLink}
                  value={form.customerPage?.supportLink ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, customerPage: { ...form.customerPage, supportLink: e.target.value } })}
                />
                <Input
                  placeholder={vi.configuration.maintenanceTelegram}
                  value={form.customerPage?.telegram ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, customerPage: { ...form.customerPage, telegram: e.target.value } })}
                />
                <Input
                  placeholder={vi.configuration.maintenanceFacebook}
                  value={form.customerPage?.facebook ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, customerPage: { ...form.customerPage, facebook: e.target.value } })}
                />
                <Input
                  placeholder={vi.configuration.maintenanceHotline}
                  value={form.customerPage?.hotline ?? ''}
                  disabled={!canManage}
                  onChange={(e) => setForm({ ...form, customerPage: { ...form.customerPage, hotline: e.target.value } })}
                />
                <Input
                  type="datetime-local"
                  disabled={!canManage}
                  value={form.customerPage?.estimatedFinish?.slice(0, 16) ?? ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      customerPage: {
                        ...form.customerPage,
                        estimatedFinish: e.target.value ? new Date(e.target.value).toISOString() : null,
                      },
                    })
                  }
                />
              </Card>
            </div>

            {canManage && (
              <Card className="space-y-3">
                <label className="block text-sm font-medium text-zinc-700">{vi.configuration.maintenancePassword}</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <Button type="button" disabled={loading} onClick={() => void saveMaintenance()}>
                  {vi.configuration.maintenanceSave}
                </Button>
              </Card>
            )}

            <Card className="space-y-3">
              <h2 className="text-lg font-semibold">{vi.configuration.maintenanceHistory}</h2>
              {(form.history ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">{vi.configuration.maintenanceNoHistory}</p>
              ) : (
                <ul className="space-y-3">
                  {(form.history ?? []).map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-zinc-100 px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-zinc-900">{entry.mode}</span>
                        <span className="text-zinc-500">{formatDateTime(entry.at)}</span>
                      </div>
                      <p className="mt-1 text-zinc-600">{entry.performedEmail ?? entry.performedBy}</p>
                      {entry.reason && <p className="mt-1 text-zinc-500">{entry.reason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </RequirePermission>
  );
}
