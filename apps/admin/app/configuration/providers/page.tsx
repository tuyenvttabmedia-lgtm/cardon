'use client';



import { useEffect, useState } from 'react';

import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';

import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';

import { RequireRole } from '@/components/layout/AdminShell';

import { Card, ErrorMessage } from '@/components/ui/Display';

import { Button, Input, Label, Select, Textarea } from '@/components/ui/Form';

import { vi } from '@/lib/i18n/vi';

import { formatDateTime, formatVnd } from '@/lib/utils';

import { formatVndDigits } from '@/lib/vnd-input';

import { adminApi, settingsAdminApi, ApiClientError } from '@/services/api-client';

import type { ProviderEsaleSettings, SystemSettings } from '@/types/api';



export default function SettingsProvidersPage() {

  const [form, setForm] = useState<ProviderEsaleSettings | null>(null);

  const [system, setSystem] = useState<SystemSettings | null>(null);

  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);



  async function load() {

    setError(null);

    try {

      const [esale, systemSettings, providers] = await Promise.all([

        settingsAdminApi.getEsale(),

        settingsAdminApi.getSystem(),

        adminApi.getProvidersStatus(),

      ]);

      setForm(esale);

      setSystem(systemSettings);

      const esaleProvider = providers.find((p) => p.code === 'ESALE');

      if (esaleProvider) {

        const detail = await adminApi.getProviderDetail(esaleProvider.id);

        setMaintenanceMode(Boolean(detail.runtimeSetting?.maintenanceMode));

      } else {

        setMaintenanceMode(false);

      }

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    }

  }



  useEffect(() => {

    void load();

  }, []);



  async function save() {

    if (!form) return;

    setBusy(true);

    setError(null);

    try {

      setForm(await settingsAdminApi.updateEsale(form));

      setMessage(vi.app.saved);

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    } finally {

      setBusy(false);

    }

  }



  async function runAction(action: 'test' | 'balance' | 'sync') {

    setBusy(true);

    setError(null);

    setMessage(null);

    try {

      if (action === 'test') {

        const r = await settingsAdminApi.testEsaleConnection();

        setMessage(r.message);

      } else if (action === 'balance') {

        const r = await settingsAdminApi.checkEsaleBalance();

        setMessage(`${vi.app.checkBalance}: ${formatVnd(r.balance)} · ${formatDateTime(r.lastCheckedAt)}`);

      } else {

        const r = await settingsAdminApi.syncEsaleProducts();

        setMessage(`${vi.app.syncProducts}: ${r.synced}${r.message ? ` — ${r.message}` : ''}`);

      }

    } catch (err) {

      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);

    } finally {

      setBusy(false);

    }

  }



  if (!form) {

    return <p className="text-zinc-500">{vi.app.loading}</p>;

  }



  return (

    <RequireRole role="SUPER_ADMIN">

      <div className="space-y-6">
        <ConfigurationAuditBar module="providers" />

        {error && <ErrorMessage message={error} />}

        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

        <Card className="max-w-3xl space-y-4">

          <SettingsRuntimeBadges source={form.source} configured={form.configured} />

          <div className="grid gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-sm sm:grid-cols-3">

            <div>

              <p className="text-zinc-500">{vi.settings.providerBalanceThreshold}</p>

              <p className="font-semibold">

                {system?.providerLowBalanceThreshold != null

                  ? `${formatVndDigits(system.providerLowBalanceThreshold)} đ`

                  : '—'}

              </p>

            </div>

            <div>

              <p className="text-zinc-500">{vi.settings.providerPriority}</p>

              <p className="font-semibold">Theo mapping sản phẩm</p>

            </div>

            <div>

              <p className="text-zinc-500">{vi.settings.providerMaintenance}</p>

              <p className="font-semibold">

                {maintenanceMode ? vi.settings.providerMaintenanceOn : vi.settings.providerMaintenanceOff}

              </p>

            </div>

          </div>

          <div className="flex items-center gap-2">

            <input

              type="checkbox"

              id="esale-enabled"

              checked={Boolean(form.enabled)}

              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}

            />

            <Label htmlFor="esale-enabled">{vi.app.enabled}</Label>

          </div>

          <div>

            <Label>{vi.app.environment}</Label>

            <Select

              className="mt-1"

              value={form.environment ?? 'production'}

              onChange={(e) =>

                setForm({ ...form, environment: e.target.value as 'sandbox' | 'production' })

              }

            >

              <option value="sandbox">{vi.app.sandbox}</option>

              <option value="production">{vi.app.production}</option>

            </Select>

          </div>

          <div>

            <Label>{vi.settings.cardApiUrl}</Label>

            <Input className="mt-1" value={form.cardApiUrl ?? ''} onChange={(e) => setForm({ ...form, cardApiUrl: e.target.value })} />

          </div>

          <div>

            <Label>{vi.settings.topupApiUrl}</Label>

            <Input className="mt-1" value={form.topupApiUrl ?? ''} onChange={(e) => setForm({ ...form, topupApiUrl: e.target.value })} />

          </div>

          <div className="grid gap-4 md:grid-cols-2">

            <div>

              <Label>{vi.settings.agencyCode}</Label>

              <Input className="mt-1" value={form.agencyCode ?? ''} onChange={(e) => setForm({ ...form, agencyCode: e.target.value })} />

            </div>

            <div>

              <Label>{vi.settings.clientCode}</Label>

              <Input className="mt-1" value={form.clientCode ?? ''} onChange={(e) => setForm({ ...form, clientCode: e.target.value })} />

            </div>

          </div>

          <div>

            <Label>{vi.settings.secretKey}</Label>

            <Input className="mt-1 font-mono" type="password" value={form.secretKey ?? ''} onChange={(e) => setForm({ ...form, secretKey: e.target.value })} />

          </div>

          <div>

            <Label>{vi.settings.privateKey}</Label>

            <Textarea className="mt-1 min-h-[80px] font-mono text-xs" value={form.privateKey ?? ''} onChange={(e) => setForm({ ...form, privateKey: e.target.value })} placeholder="-----BEGIN RSA PRIVATE KEY-----" />

          </div>

          <div>

            <Label>{vi.settings.publicKey}</Label>

            <Textarea className="mt-1 min-h-[80px] font-mono text-xs" value={form.publicKey ?? ''} onChange={(e) => setForm({ ...form, publicKey: e.target.value })} />

          </div>

          <div>

            <Label>{vi.settings.timeoutMs}</Label>

            <Input className="mt-1" type="number" value={form.timeoutMs ?? 30000} onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} />

          </div>

          <div className="flex flex-wrap gap-2">

            <Button onClick={() => void save()} disabled={busy}>{vi.app.save}</Button>

            <Button variant="secondary" onClick={() => void runAction('test')} disabled={busy}>{vi.app.testConnection}</Button>

            <Button variant="secondary" onClick={() => void runAction('balance')} disabled={busy}>{vi.app.checkBalance}</Button>

            <Button variant="secondary" onClick={() => void runAction('sync')} disabled={busy}>{vi.app.syncProducts}</Button>

          </div>

        </Card>

      </div>

    </RequireRole>

  );

}

