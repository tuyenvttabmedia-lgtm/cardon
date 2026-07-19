'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConfigurationStatusBadge } from '@/components/configuration/ConfigurationStatusBadge';
import { Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi, ApiClientError } from '@/services/api-client';

const LINKS = [
  { href: '/configuration/payment', label: 'MegaPay / SePay', moduleId: 'payment', test: () => configurationCenterApi.testMegapay() },
  { href: '/configuration/smtp', label: 'SMTP', moduleId: 'smtp', test: null },
  { href: '/configuration/telegram', label: 'Telegram', moduleId: 'telegram', test: () => configurationCenterApi.testTelegram({}) },
  { href: '/configuration/providers', label: 'Provider eSale', moduleId: 'providers', test: () => configurationCenterApi.testProvider() },
  { href: '/configuration/webhooks', label: 'Webhooks', moduleId: 'webhooks', test: () => configurationCenterApi.testWebhook() },
] as const;

export function ConfigurationIntegrationsPanel() {
  const [modules, setModules] = useState<Array<{ id: string; label: string; status: string }>>([]);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  useEffect(() => {
    void configurationCenterApi
      .overview()
      .then((o) =>
        setModules(
          o.modules.filter((m) =>
            ['payment', 'smtp', 'telegram', 'providers', 'webhooks'].includes(m.id),
          ),
        ),
      )
      .catch(() => undefined);
  }, []);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{vi.configuration.integrationsTitle}</h2>
        <p className="mt-1 text-sm text-zinc-500">{vi.configuration.integrationsSubtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {LINKS.map((link) => {
          const mod = modules.find((m) => m.id === link.moduleId);
          return (
            <div key={link.href} className="space-y-3 rounded-xl border border-zinc-100 p-4">
              <div className="flex items-center justify-between">
                <Link href={link.href} className="font-semibold text-admin-700 hover:underline">
                  {link.label}
                </Link>
                {mod && <ConfigurationStatusBadge status={mod.status} />}
              </div>
              {link.test && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setTestMsg(null);
                    void link
                      .test!()
                      .then((r) => setTestMsg((r as { message?: string }).message ?? 'OK'))
                      .catch((e) => setTestMsg(e instanceof ApiClientError ? e.message : 'Failed'));
                  }}
                >
                  {vi.configuration.testConnection}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {testMsg && <p className="text-sm text-zinc-600">{testMsg}</p>}
    </Card>
  );
}
