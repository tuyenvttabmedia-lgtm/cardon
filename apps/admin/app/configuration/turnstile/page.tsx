'use client';

import { useEffect, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { TurnstileSettings } from '@/types/api';

export default function SettingsTurnstilePage() {
  const [form, setForm] = useState<TurnstileSettings | null>(null);
  const [siteKey, setSiteKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [allowedHostnames, setAllowedHostnames] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getTurnstile()
      .then((next) => {
        setForm(next);
        setEnabled(next.enabled === true);
        setSiteKey(next.siteKey ?? '');
        setAllowedHostnames(next.allowedHostnames ?? 'cardon.vn,www.cardon.vn');
      })
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const next = await settingsAdminApi.updateTurnstile({
        enabled,
        siteKey: siteKey.trim(),
        allowedHostnames: allowedHostnames.trim(),
        ...(secretKey.trim() ? { secretKey: secretKey.trim() } : {}),
      });
      setForm(next);
      setEnabled(next.enabled === true);
      setSiteKey(next.siteKey ?? '');
      setAllowedHostnames(next.allowedHostnames ?? '');
      setSecretKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  async function clearSecret() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const next = await settingsAdminApi.updateTurnstile({
        enabled,
        siteKey: siteKey.trim(),
        allowedHostnames: allowedHostnames.trim(),
        clearSecret: true,
      });
      setForm(next);
      setSecretKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
        <ConfigurationAuditBar module="turnstile" />
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges
            source={form.source}
            secretsProtected={Boolean(form.secretConfigured || form.secretKey)}
          />
          <p className="text-sm text-slate-600">
            Cloudflare Turnstile cho đăng ký, đại lý, ticket và guest checkout. Secret mã hóa AES trong DB —
            không cần sửa .env trên VPS. Ô Secret trống khi lưu giữ secret cũ. Site Key là public.
          </p>
          {form.ready ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Sẵn sàng: bật + đủ Site Key + Secret (DB hoặc ENV).
            </p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Chưa sẵn sàng — cần bật và nhập đủ Site Key + Secret Key từ Cloudflare Turnstile widget.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            Bật Turnstile (TURNSTILE_ENABLED qua admin)
          </label>
          <div>
            <Label>Site Key</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={siteKey}
              onChange={(e) => setSiteKey(e.target.value)}
              placeholder="0x4AAAA..."
            />
          </div>
          <div>
            <Label>Secret Key</Label>
            <Input
              className="mt-1 font-mono text-sm"
              type="password"
              autoComplete="new-password"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder={
                form.secretConfigured ? 'Đã cấu hình (ẩn) — nhập mới để thay' : 'Nhập Secret Key'
              }
            />
            {form.secretConfigured && (
              <p className="mt-1 text-xs text-slate-500">Secret đã lưu (mask). Để trống = giữ nguyên.</p>
            )}
          </div>
          <div>
            <Label>Allowed hostnames (CSV)</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={allowedHostnames}
              onChange={(e) => setAllowedHostnames(e.target.value)}
              placeholder="cardon.vn,www.cardon.vn"
            />
            <p className="mt-1 text-xs text-slate-500">
              Khớp hostname Cloudflare trả về khi siteverify. Local: thêm localhost.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void save()}>
              {vi.app.save}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !form.secretConfigured}
              onClick={() => void clearSecret()}
            >
              Xóa Secret (fallback ENV)
            </Button>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
