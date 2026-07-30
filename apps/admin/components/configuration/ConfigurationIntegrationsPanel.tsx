'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ConfigurationStatusBadge } from '@/components/configuration/ConfigurationStatusBadge';
import { Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi, ApiClientError } from '@/services/api-client';

type TestResult = { ok?: boolean; message?: string };

type IntegrationItem = {
  key: string;
  href: string;
  label: string;
  moduleId: string;
  test: (() => Promise<TestResult>) | null;
  hint?: string;
};

const ITEMS: IntegrationItem[] = [
  {
    key: 'sepay',
    href: '/configuration/payment',
    label: 'SePay',
    moduleId: 'payment',
    test: () => configurationCenterApi.testSepay(),
    hint: 'VietQR / CK: kiểm tra cấu hình STK + HMAC. Cổng PG: gọi API SePay.',
  },
  {
    key: 'megapay',
    href: '/configuration/payment',
    label: 'MegaPay',
    moduleId: 'payment',
    test: () => configurationCenterApi.testMegapay(),
    hint: 'Kiểm tra URL endpoint MegaPay (chưa gồm xác thực API đầy đủ).',
  },
  {
    key: 'smtp',
    href: '/configuration/smtp',
    label: 'SMTP',
    moduleId: 'smtp',
    test: null,
  },
  {
    key: 'telegram',
    href: '/configuration/telegram',
    label: 'Telegram',
    moduleId: 'telegram',
    test: () => configurationCenterApi.testTelegram({}),
  },
  {
    key: 'providers',
    href: '/configuration/providers',
    label: 'Provider eSale',
    moduleId: 'providers',
    test: () => configurationCenterApi.testProvider(),
  },
  {
    key: 'webhooks',
    href: '/configuration/webhooks',
    label: 'Webhooks',
    moduleId: 'webhooks',
    test: () => configurationCenterApi.testWebhook(),
  },
];

export function ConfigurationIntegrationsPanel() {
  const [modules, setModules] = useState<Array<{ id: string; label: string; status: string }>>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});

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

  async function runTest(item: IntegrationItem) {
    if (!item.test) return;
    setBusyKey(item.key);
    setResults((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    try {
      const r = await item.test();
      setResults((prev) => ({
        ...prev,
        [item.key]: {
          ok: r.ok !== false,
          message: r.message ?? 'OK',
        },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [item.key]: {
          ok: false,
          message: e instanceof ApiClientError ? e.message : 'Thử kết nối thất bại',
        },
      }));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{vi.configuration.integrationsTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{vi.configuration.integrationsSubtitle}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {ITEMS.map((item) => {
          const mod = modules.find((m) => m.id === item.moduleId);
          const result = results[item.key];
          return (
            <div key={item.key} className="space-y-3 rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between gap-2">
                <Link href={item.href} className="font-semibold text-admin-700 hover:underline">
                  {item.label}
                </Link>
                {mod && <ConfigurationStatusBadge status={mod.status} />}
              </div>
              {item.hint ? <p className="text-xs text-slate-500">{item.hint}</p> : null}
              {item.test && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={busyKey === item.key}
                  onClick={() => void runTest(item)}
                >
                  {busyKey === item.key ? 'Đang kiểm tra…' : vi.configuration.testConnection}
                </Button>
              )}
              {result && (
                <p
                  className={`text-sm ${
                    result.ok ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {result.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
