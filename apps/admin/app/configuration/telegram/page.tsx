'use client';

import { useEffect, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi, settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { TelegramSettings } from '@/types/api';

export default function SettingsTelegramPage() {
  const [form, setForm] = useState<TelegramSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    settingsAdminApi
      .getTelegram()
      .then(setForm)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setError(null);
    try {
      const payload: Partial<TelegramSettings> = {
        enabled: form.enabled,
        chatId: form.chatId,
      };
      if (form.botToken && !form.botToken.startsWith('********')) {
        payload.botToken = form.botToken;
      }
      setForm(await settingsAdminApi.updateTelegram(payload));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

  if (!form) {
    return <p className="text-zinc-500">{vi.app.loading}</p>;
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="telegram" />
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        {testMsg && <p className="text-sm text-zinc-600">{testMsg}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges source={form.source} secretsProtected={Boolean(form.botToken)} />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled === true}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Bật Telegram Bot
          </label>
          <div>
            <Label>Bot Token</Label>
            <Input
              className="mt-1 font-mono text-sm"
              placeholder="Nhập token mới để thay đổi"
              value={form.botToken?.startsWith('********') ? '' : (form.botToken ?? '')}
              onChange={(e) => setForm({ ...form, botToken: e.target.value })}
            />
            {form.botToken?.startsWith('********') && (
              <p className="mt-1 text-xs text-zinc-500">Token đã cấu hình (ẩn)</p>
            )}
          </div>
          <div>
            <Label>Chat ID</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={form.chatId ?? ''}
              onChange={(e) => setForm({ ...form, chatId: e.target.value })}
            />
          </div>
          <Button onClick={() => void save()}>{vi.app.save}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setTestMsg(null);
              void configurationCenterApi.testTelegram({}).then((r) => setTestMsg(r.message ?? 'OK')).catch((e) =>
                setTestMsg(e instanceof ApiClientError ? e.message : 'Failed'),
              );
            }}
          >
            {vi.configuration.testConnection}
          </Button>
        </Card>
      </div>
    </RequireRole>
  );
}
