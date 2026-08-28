'use client';

import { useEffect, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Label } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { ContentAiSettings } from '@/types/api';

export default function SettingsContentAiPage() {
  const [form, setForm] = useState<ContentAiSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getContentAi()
      .then(setForm)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const payload: Partial<ContentAiSettings> = {
        providerId: form.providerId,
        baseUrl: form.baseUrl,
        model: form.model,
        timeoutMs: form.timeoutMs,
        maxTokens: form.maxTokens,
        temperature: form.temperature,
      };
      if (apiKeyInput.trim()) {
        payload.apiKey = apiKeyInput.trim();
      }
      const next = await settingsAdminApi.updateContentAi(payload);
      setForm(next);
      setApiKeyInput('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        {error ? <ErrorMessage message={error} /> : <p className="text-slate-500">{vi.app.loading}</p>}
      </div>
    );
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="content-ai" />
        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}
        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges
            source={form.source === 'database' ? 'database' : undefined}
            secretsProtected={Boolean(form.apiKey)}
            configured={form.configured}
          />
          <p className="text-sm text-slate-600">
            Cấu hình provider OpenAI-compatible dùng cho Content Automation (analyze / outline / write).
            Có thể lưu khi feature flag vẫn tắt.
          </p>
          <div>
            <Label>Provider</Label>
            <Input className="mt-1 font-mono text-sm" value={form.providerId} disabled />
          </div>
          <div>
            <Label>Base URL</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div>
            <Label>Model</Label>
            <Input
              className="mt-1 font-mono text-sm"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              placeholder="gpt-4.1-mini"
            />
          </div>
          <div>
            <Label>API Key</Label>
            <Input
              className="mt-1 font-mono text-sm"
              type="password"
              autoComplete="new-password"
              placeholder={form.apiKey ? 'Nhập key mới để thay đổi' : 'sk-...'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            {form.apiKey && (
              <p className="mt-1 text-xs text-slate-500">Key đã cấu hình (ẩn): {form.apiKey}</p>
            )}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>Timeout (ms)</Label>
              <Input
                className="mt-1"
                type="number"
                min={5000}
                max={300000}
                value={form.timeoutMs}
                onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Max tokens</Label>
              <Input
                className="mt-1"
                type="number"
                min={256}
                max={32768}
                value={form.maxTokens}
                onChange={(e) => setForm({ ...form, maxTokens: Number(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Temperature</Label>
              <Input
                className="mt-1"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <Button disabled={busy} onClick={() => void save()}>
            {vi.app.save}
          </Button>
        </Card>
      </div>
    </RequireRole>
  );
}
