'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { InfoTooltip } from '@/components/configuration/InfoTooltip';
import { SettingsField } from '@/components/configuration/SettingsField';
import { VndInput } from '@/components/configuration/VndInput';
import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { isSettingsDeveloperMode } from '@/lib/settings-developer-mode';
import { validateVndAmount } from '@/lib/vnd-input';
import { settingsAdminApi, ApiClientError } from '@/services/api-client';
import type { SystemSettings } from '@/types/api';

export default function SettingsSystemPage() {
  const [form, setForm] = useState<SystemSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsAdminApi
      .getSystem()
      .then(setForm)
      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));
  }, []);

  const providerThresholdError = form
    ? validateVndAmount(form.providerLowBalanceThreshold ?? 0, false)
    : null;
  const agentThresholdError = form
    ? validateVndAmount(form.agentLowBalanceThreshold ?? 0, false)
    : null;
  const hasValidationError = Boolean(providerThresholdError || agentThresholdError);

  async function save() {
    if (!form || hasValidationError) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await settingsAdminApi.updateSystem({
        siteName: form.siteName,
        publicUrl: form.publicUrl,
        providerLowBalanceThreshold: form.providerLowBalanceThreshold,
        agentLowBalanceThreshold: form.agentLowBalanceThreshold,
        customerTopupEnabled: form.customerTopupEnabled,
        customerDataEnabled: form.customerDataEnabled,
      });
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setSaving(false);
    }
  }

  if (!form) {
    return <p className="text-zinc-500">{vi.app.loading}</p>;
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="system" />

        {error && <ErrorMessage message={error} />}
        {saved && <p className="text-sm text-emerald-600">{vi.app.saved}</p>}

        <Card className="max-w-xl space-y-4">
          <SettingsRuntimeBadges source={form.source} secretsProtected={false} />
          <SettingsField label={vi.settings.siteName} hint={vi.settings.siteNameHint}>
            <Input
              value={form.siteName ?? ''}
              onChange={(e) => setForm({ ...form, siteName: e.target.value })}
            />
          </SettingsField>
          <SettingsField label={vi.settings.publicUrl} hint={vi.settings.publicUrlHint}>
            <Input
              value={form.publicUrl ?? ''}
              onChange={(e) => setForm({ ...form, publicUrl: e.target.value })}
              placeholder="https://cardon.vn"
            />
          </SettingsField>
          <SettingsField
            label={vi.settings.providerLowBalanceLabel}
            tooltip={vi.settings.providerLowBalanceTooltip}
            hint={vi.settings.providerLowBalanceHint}
          >
            <VndInput
              value={form.providerLowBalanceThreshold ?? 0}
              allowZero={false}
              onChange={(providerLowBalanceThreshold) =>
                setForm({ ...form, providerLowBalanceThreshold })
              }
            />
          </SettingsField>
          <SettingsField
            label={vi.settings.agentLowBalanceLabel}
            tooltip={vi.settings.agentLowBalanceTooltip}
            hint={vi.settings.agentLowBalanceHint}
          >
            <VndInput
              value={form.agentLowBalanceThreshold ?? 0}
              allowZero={false}
              onChange={(agentLowBalanceThreshold) =>
                setForm({ ...form, agentLowBalanceThreshold })
              }
            />
          </SettingsField>
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.customerTopupEnabled === true}
                onChange={(e) => setForm({ ...form, customerTopupEnabled: e.target.checked })}
              />
              <span>
                <span className="flex items-center font-medium text-zinc-700">
                  {vi.settings.customerTopupLabel}
                  <InfoTooltip text={vi.settings.customerTopupTooltip} />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                  {vi.settings.customerTopupHint}
                </span>
              </span>
            </label>
          </div>
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.customerDataEnabled === true}
                onChange={(e) => setForm({ ...form, customerDataEnabled: e.target.checked })}
              />
              <span>
                <span className="flex items-center font-medium text-zinc-700">
                  {vi.settings.customerDataLabel}
                  <InfoTooltip text={vi.settings.customerDataTooltip} />
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
                  {vi.settings.customerDataHint}
                </span>
              </span>
            </label>
          </div>
          <Button onClick={() => void save()} disabled={saving || hasValidationError}>
            {saving ? vi.app.loading : vi.app.save}
          </Button>
        </Card>

        <Card className="max-w-xl space-y-3 text-sm text-zinc-700">
          <h2 className="text-lg font-semibold text-zinc-900">{vi.configuration.securityTitle}</h2>
          <p>{vi.configuration.secretsProtectedDesc}</p>
          <ul className="list-inside list-disc space-y-1">
            <li>SMTP Password</li>
            <li>Telegram Token</li>
            <li>MegaPay Secret / Webhook Secret</li>
            <li>SePay API Key / Webhook Secret</li>
            <li>Provider Private Key</li>
          </ul>
          <p className="text-zinc-500">
            {vi.configuration.developerOverride}:{' '}
            {isSettingsDeveloperMode() ? vi.configuration.yes : vi.configuration.no}
          </p>
        </Card>

        <Card className="max-w-xl space-y-4">
          <h2 className="text-lg font-semibold text-zinc-900">{vi.configuration.advancedTitle}</h2>
          <p className="text-sm text-zinc-600">{vi.configuration.advancedHint}</p>
          <Button type="button" onClick={() => void settingsAdminApi.reloadAll()}>
            {vi.configuration.reloadSettings}
          </Button>
          <Link href="/configuration/health" className="block text-sm text-admin-600 hover:underline">
            {vi.configuration.openHealthCheck}
          </Link>
        </Card>
      </div>
    </RequireRole>
  );
}
