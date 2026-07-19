'use client';



import { useEffect, useState } from 'react';

import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';

import { SettingsField } from '@/components/configuration/SettingsField';

import { VndInput } from '@/components/configuration/VndInput';

import { SettingsRuntimeBadges } from '@/components/configuration/SettingsRuntimeBadges';

import { RequireRole } from '@/components/layout/AdminShell';

import { Card, ErrorMessage } from '@/components/ui/Display';

import { Button } from '@/components/ui/Form';

import { vi } from '@/lib/i18n/vi';

import { validateVndAmount } from '@/lib/vnd-input';

import { settingsAdminApi, ApiClientError } from '@/services/api-client';

import type { OrderSettings } from '@/types/api';



export default function SettingsOrderPage() {

  const [form, setForm] = useState<OrderSettings | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState(false);

  const [saving, setSaving] = useState(false);



  useEffect(() => {

    settingsAdminApi

      .getOrder()

      .then(setForm)

      .catch((err) => setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed));

  }, []);



  const guestError = form ? validateVndAmount(form.guestMaxOrderAmount ?? 0) : null;

  const customerError = form ? validateVndAmount(form.customerMaxOrderAmount ?? 0) : null;

  const hasValidationError = Boolean(guestError || customerError);



  async function save() {

    if (!form || hasValidationError) return;

    setSaving(true);

    setError(null);

    try {

      const updated = await settingsAdminApi.updateOrder({

        guestMaxOrderAmount: form.guestMaxOrderAmount ?? 0,

        customerMaxOrderAmount: form.customerMaxOrderAmount ?? 0,

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

        <ConfigurationAuditBar module="orders" />

        {error && <ErrorMessage message={error} />}

        {saved && <p className="text-sm text-emerald-600">{vi.settings.orderSaved}</p>}

        <Card className="max-w-xl space-y-4">

          <SettingsRuntimeBadges source={form.source} secretsProtected={false} />

          <SettingsField

            label={vi.settings.guestMaxOrder}

            tooltip={vi.settings.guestMaxOrderTooltip}

            hint={vi.settings.orderLimitHint}

          >

            <VndInput

              value={form.guestMaxOrderAmount ?? 0}

              onChange={(guestMaxOrderAmount) => setForm({ ...form, guestMaxOrderAmount })}

            />

          </SettingsField>

          <SettingsField

            label={vi.settings.customerMaxOrder}

            tooltip={vi.settings.customerMaxOrderTooltip}

            hint={vi.settings.orderLimitHint}

          >

            <VndInput

              value={form.customerMaxOrderAmount ?? 0}

              onChange={(customerMaxOrderAmount) => setForm({ ...form, customerMaxOrderAmount })}

            />

          </SettingsField>

          <Button onClick={() => void save()} disabled={saving || hasValidationError}>

            {saving ? vi.app.loading : vi.app.save}

          </Button>

        </Card>

      </div>

    </RequireRole>

  );

}

