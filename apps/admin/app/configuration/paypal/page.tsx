'use client';

import { useEffect, useState } from 'react';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { PaymentPaypalSettings, PaypalConnectionStatus } from '@/types/api';

const STATUS_LABEL: Record<PaypalConnectionStatus, string> = {
  NOT_CONFIGURED: 'NOT_CONFIGURED — chưa có credential',
  INCOMPLETE: 'INCOMPLETE — thiếu credential',
  CONFIGURED: 'CONFIGURED — đủ credential, chưa gọi là đã kết nối',
  CONNECTION_ERROR: 'CONNECTION_ERROR — lần kiểm tra gần nhất thất bại',
};

export default function SettingsPaypalPage() {
  const [form, setForm] = useState<PaymentPaypalSettings | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [webhookId, setWebhookId] = useState('');
  const [mode, setMode] = useState<'sandbox' | 'live'>('sandbox');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [probeNote, setProbeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getPaypal()
      .then((next) => {
        setForm(next);
        setMode(next.mode === 'live' ? 'live' : 'sandbox');
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    setProbeNote(null);
    try {
      const next = await settingsAdminApi.updatePaypal({
        mode,
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
        ...(webhookId.trim() ? { webhookId: webhookId.trim() } : {}),
      });
      setForm(next);
      setClientId('');
      setClientSecret('');
      setWebhookId('');
      setMode(next.mode === 'live' ? 'live' : 'sandbox');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function probe() {
    setBusy(true);
    setError(null);
    setProbeNote(null);
    try {
      const result = await settingsAdminApi.testPaypal();
      const fresh = await settingsAdminApi.getPaypal();
      setForm(fresh);
      setMode(fresh.mode === 'live' ? 'live' : 'sandbox');
      if (result.reason === 'LIVE_PROBE_DISABLED') {
        setProbeNote('Không gọi PayPal Live. Trạng thái không phải CONNECTED.');
      } else if (result.probed && result.connectionStatus === 'CONFIGURED') {
        setProbeNote('Sandbox đã trả token. Trạng thái giữ CONFIGURED, không đánh dấu CONNECTED.');
      } else {
        setProbeNote(`Kết quả kiểm tra: ${result.connectionStatus}${result.reason ? ` (${result.reason})` : ''}`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return error ? <ErrorMessage message={error} /> : <p className="text-slate-500">{vi.app.loading}</p>;
  }

  const status = form.connectionStatus ?? 'NOT_CONFIGURED';

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges source={form.source} secretsProtected />
          <p className="text-sm font-semibold text-cardon-navy">
            Môi trường đang lưu: {form.environmentLabel ?? (form.mode === 'live' ? 'LIVE' : 'SANDBOX')}
          </p>
          <p className="text-sm text-slate-700">{STATUS_LABEL[status]}</p>
          <p className="text-sm text-slate-600">
            PayPal chỉ cho eSIM quốc tế (USD). Secret chỉ hiện dạng mask. Ô trống khi lưu giữ secret cũ.
            Đổi Sandbox/Live không bật checkout.
          </p>
          {mode === 'live' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              LIVE dùng tiền thật. Lưu LIVE không gọi API và không tự chuyển về Sandbox khi lỗi. Checkout khách vẫn tắt.
            </p>
          )}
          <div>
            <Label htmlFor="paypal-mode">Môi trường</Label>
            <Select
              id="paypal-mode"
              className="mt-1"
              value={mode}
              onChange={(event) => setMode(event.target.value === 'live' ? 'live' : 'sandbox')}
            >
              <option value="sandbox">Sandbox</option>
              <option value="live">Live</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="paypal-client-id">Client ID</Label>
            <Input
              id="paypal-client-id"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
              placeholder={form.clientId ? String(form.clientId) : 'Client ID'}
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="paypal-client-secret">Client secret</Label>
            <Input
              id="paypal-client-secret"
              type="password"
              className="mt-1 font-mono text-sm"
              autoComplete="new-password"
              placeholder={form.clientSecret ? String(form.clientSecret) : 'Client secret'}
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">Để trống để giữ secret hiện tại. Không dán lại chuỗi mask.</p>
          </div>
          <div>
            <Label htmlFor="paypal-webhook-id">Webhook ID</Label>
            <Input
              id="paypal-webhook-id"
              className="mt-1 font-mono text-sm"
              autoComplete="off"
              placeholder={form.webhookId ? String(form.webhookId) : 'Webhook ID'}
              value={webhookId}
              onChange={(event) => setWebhookId(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {busy ? 'Đang lưu…' : vi.app.save}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void probe()}>
              Kiểm tra kết nối
            </Button>
          </div>
          {probeNote && <p className="text-sm text-slate-700">{probeNote}</p>}
        </Card>
        <Card className="max-w-xl space-y-2">
          <p className="font-semibold text-slate-800">Feature flags</p>
          <p className="text-sm text-slate-600">Ba cờ tách riêng. Trang này chưa hỗ trợ đổi chúng.</p>
          <FlagRow label="PAYPAL_ESIM_ENABLED" on={form.paypalEsimEnabled === true} />
          <FlagRow label="customerEsimEnabled" on={form.customerEsimEnabled === true} />
          <FlagRow label="salesOpen" on={form.salesOpen === true} />
        </Card>
      </div>
    </RequireRole>
  );
}

function FlagRow({ label, on }: { label: string; on: boolean }) {
  return (
    <p className="text-sm text-slate-800">
      <span className="font-mono">{label}</span>
      {': '}
      <span className={on ? 'text-amber-700' : 'text-slate-500'}>{on ? 'ON' : 'OFF'}</span>
    </p>
  );
}
