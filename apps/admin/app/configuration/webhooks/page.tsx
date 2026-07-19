'use client';

import { useEffect, useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi, settingsAdminApi, ApiClientError } from '@/services/api-client';

import type { PaymentGatewaySettings } from '@/types/api';

export default function ConfigurationWebhooksPage() {
  const [megapay, setMegapay] = useState<PaymentGatewaySettings | null>(null);
  const [sepay, setSepay] = useState<PaymentGatewaySettings | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([settingsAdminApi.getMegapay(), settingsAdminApi.getSepay()])
      .then(([m, s]) => { setMegapay(m); setSepay(s); })
      .catch((e) => setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed));
  }, []);

  async function testWebhook() {
    setTestResult(null);
    try {
      const r = await configurationCenterApi.testWebhook();
      setTestResult(r.message ?? 'OK');
    } catch (e) {
      setTestResult(e instanceof ApiClientError ? e.message : 'Failed');
    }
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="webhooks" />
        {error && <ErrorMessage message={error} />}
        <Card className="space-y-3">
          <h2 className="font-semibold">MegaPay</h2>
          <p className="font-mono text-sm text-zinc-600">{String(megapay?.callbackUrl ?? megapay?.webhookUrl ?? '—')}</p>
          <h2 className="font-semibold">SePay</h2>
          <p className="font-mono text-sm text-zinc-600">{String(sepay?.webhookUrl ?? '—')}</p>
          <Button type="button" onClick={() => void testWebhook()}>{vi.configuration.testWebhook}</Button>
          {testResult && <p className="text-sm text-zinc-600">{testResult}</p>}
        </Card>
      </div>
    </RequireRole>
  );
}
