'use client';

import { useEffect, useState } from 'react';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { PaymentPaypalSettings } from '@/types/api';

export default function SettingsPaypalPage() {
  const [form, setForm] = useState<PaymentPaypalSettings | null>(null);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [esimEnabled, setEsimEnabled] = useState(false);
  const [mode, setMode] = useState<'sandbox' | 'live'>('sandbox');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getPaypal()
      .then((next) => {
        setForm(next);
        setEsimEnabled(next.esimEnabled === true);
        setMode(next.mode === 'live' ? 'live' : 'sandbox');
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const next = await settingsAdminApi.updatePaypal({
        esimEnabled,
        mode,
        ...(clientId.trim() ? { clientId: clientId.trim() } : {}),
        ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      });
      setForm(next);
      setClientId('');
      setClientSecret('');
      setEsimEnabled(next.esimEnabled === true);
      setMode(next.mode === 'live' ? 'live' : 'sandbox');
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return error ? <ErrorMessage message={error} /> : <p className="text-slate-500">{vi.app.loading}</p>;
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges
            source={form.source}
            secretsProtected={Boolean(form.configured)}
          />
          <p className="text-sm text-slate-600">
            PayPal chỉ cho eSIM quốc tế (USD + Airalo). Không dùng cho thẻ game, thẻ ĐT hay nạp
            cước. Checkout live vẫn tắt cho đến khi bật cờ bên dưới và triển khai API đầy đủ.
          </p>
          <div className="flex items-center gap-2">
            <input
              id="paypal-esim-enabled"
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={esimEnabled}
              onChange={(event) => setEsimEnabled(event.target.checked)}
            />
            <Label htmlFor="paypal-esim-enabled" className="!mb-0">
              Bật PayPal cho eSIM quốc tế
            </Label>
          </div>
          <div>
            <Label htmlFor="paypal-mode">Chế độ</Label>
            <Select
              id="paypal-mode"
              className="mt-1"
              value={mode}
              onChange={(event) =>
                setMode(event.target.value === 'live' ? 'live' : 'sandbox')
              }
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
              placeholder={form.clientId ? String(form.clientId) : 'Dán PayPal client_id'}
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
              autoComplete="off"
              placeholder="Dán PayPal client_secret"
              value={clientSecret}
              onChange={(event) => setClientSecret(event.target.value)}
            />
            {form.configured && (
              <p className="mt-1 text-xs text-slate-500">
                Đã có credential. Ô trống giữ giá trị hiện tại.
              </p>
            )}
          </div>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            {busy ? 'Đang lưu…' : vi.app.save}
          </Button>
        </Card>
      </div>
    </RequireRole>
  );
}
