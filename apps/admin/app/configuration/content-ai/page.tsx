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
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

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

  async function testConnection() {
    if (!form) return;
    setTestBusy(true);
    setTestMessage(null);
    setTestOk(null);
    setError(null);
    try {
      const result = await settingsAdminApi.testContentAiConnection({
        baseUrl: form.baseUrl,
        model: form.model,
        timeoutMs: form.timeoutMs,
        ...(apiKeyInput.trim() ? { apiKey: apiKeyInput.trim() } : {}),
      });
      setTestOk(result.ok);
      const detail = result.ok
        ? `${result.message}${result.latencyMs != null ? ` (${result.latencyMs}ms)` : ''}`
        : `${result.message}${result.errorKind ? ` [${result.errorKind}]` : ''}`;
      setTestMessage(detail);
    } catch (err) {
      setTestOk(false);
      setTestMessage(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setTestBusy(false);
    }
  }

  if (!form) {
    return (
      <div className="space-y-4">
        {error ? <ErrorMessage message={error} /> : <p className="text-slate-500">{vi.app.loading}</p>}
      </div>
    );
  }

  const maxTimeout = form.maxAllowedTimeoutMs ?? 170_000;

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
            Có thể lưu và thử kết nối khi feature flag vẫn tắt.
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
                max={maxTimeout}
                value={form.timeoutMs}
                onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) || 0 })}
              />
              <p className="mt-1 text-xs text-slate-500">
                Tối đa {maxTimeout}ms
                {form.jobTimeoutMs ? ` (job soft timeout ${form.jobTimeoutMs}ms)` : ''}.{' '}
                {vi.configuration.contentAiTimeoutHint}
              </p>
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
          {testMessage ? (
            <p
              className={`text-sm ${
                testOk ? 'text-emerald-700' : 'text-red-600'
              }`}
            >
              {testOk ? vi.configuration.contentAiTestOk : vi.configuration.contentAiTestFail}:{' '}
              {testMessage}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || testBusy} onClick={() => void save()}>
              {vi.app.save}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || testBusy}
              onClick={() => void testConnection()}
            >
              {testBusy ? 'Đang kiểm tra…' : vi.app.testConnection}
            </Button>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
