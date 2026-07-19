'use client';

import { useEffect, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { SmtpSettings } from '@/types/api';

export default function SettingsSmtpPage() {
  const [form, setForm] = useState<SmtpSettings | null>(null);
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getSmtp()
      .then(setForm)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      setForm(await settingsAdminApi.updateSmtp(form));
      setMessage(vi.app.saved);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function testEmail() {
    if (!testTo) return;
    setBusy(true);
    setError(null);
    try {
      await settingsAdminApi.testSmtp(testTo);
      setMessage(`Email thử đã gửi tới ${testTo}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        {error ? <ErrorMessage message={error} /> : <p className="text-zinc-500">{vi.app.loading}</p>}
      </div>
    );
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="smtp" />
        {error && <ErrorMessage message={error} />}
        {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges source={form.source} configured={form.configured} />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="smtp-enabled" checked={Boolean(form.enabled)} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            <Label htmlFor="smtp-enabled">{vi.app.enabled}</Label>
          </div>
          <div>
            <Label>{vi.settings.smtpHost}</Label>
            <Input className="mt-1" value={form.host ?? ''} onChange={(e) => setForm({ ...form, host: e.target.value })} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>{vi.settings.smtpPort}</Label>
              <Input className="mt-1" type="number" value={form.port ?? 587} onChange={(e) => setForm({ ...form, port: Number(e.target.value) })} />
            </div>
            <div className="flex items-end gap-2 pb-2">
              <input type="checkbox" id="smtp-secure" checked={Boolean(form.secure)} onChange={(e) => setForm({ ...form, secure: e.target.checked })} />
              <Label htmlFor="smtp-secure">{vi.settings.smtpSecure}</Label>
            </div>
          </div>
          <div>
            <Label>{vi.settings.smtpUser}</Label>
            <Input className="mt-1" value={form.username ?? ''} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <Label>{vi.settings.smtpPass}</Label>
            <Input className="mt-1 font-mono" type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <Label>{vi.settings.smtpFrom}</Label>
            <Input className="mt-1" value={form.from ?? ''} onChange={(e) => setForm({ ...form, from: e.target.value })} />
          </div>
          <div>
            <Label>Tên người gửi (From name)</Label>
            <Input className="mt-1" value={form.fromName ?? ''} onChange={(e) => setForm({ ...form, fromName: e.target.value })} placeholder="CardOn.vn" />
          </div>
          <Button onClick={() => void save()} disabled={busy}>{vi.app.save}</Button>
          <div className="border-t border-zinc-100 pt-4">
            <Label>Gửi email thử</Label>
            <div className="mt-1 flex gap-2">
              <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="admin@cardon.vn" />
              <Button variant="secondary" onClick={() => void testEmail()} disabled={busy || !testTo}>
                Gửi email thử
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
