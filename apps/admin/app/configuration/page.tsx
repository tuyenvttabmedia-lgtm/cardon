'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { ConfigurationDependencies, ConfigurationStatusBadge } from '@/components/configuration/ConfigurationStatusBadge';
import { ConfigurationIntegrationsPanel } from '@/components/configuration/ConfigurationIntegrationsPanel';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { configurationCenterApi, ApiClientError } from '@/services/api-client';
import type { ConfigurationOverview } from '@/types/api';

function OverviewCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'ok' | 'warn' | 'error';
}) {
  const cls =
    tone === 'ok' ? 'text-green-700' : tone === 'warn' ? 'text-yellow-700' : tone === 'error' ? 'text-red-700' : 'text-zinc-800';
  return (
    <Card className="text-center">
      <p className={cn('text-2xl font-bold', cls)}>{value}</p>
      <p className="mt-1 text-sm text-zinc-500">{label}</p>
    </Card>
  );
}

export default function ConfigurationOverviewPage() {
  const [data, setData] = useState<ConfigurationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await configurationCenterApi.overview());
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.configuration.loadError);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>↻</Button>
      </div>

      {error && <ErrorMessage message={error} />}

      {s && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <OverviewCard label={vi.configuration.configuredModules} value={`${s.configuredModules}/${s.totalModules}`} tone="ok" />
          <OverviewCard label={vi.configuration.warnings} value={s.warnings} tone={s.warnings > 0 ? 'warn' : 'ok'} />
          <OverviewCard label={vi.configuration.secretsProtected} value={s.secretsProtected ? vi.configuration.yes : vi.configuration.no} tone="ok" />
          <OverviewCard label={vi.configuration.environment} value={s.environment} />
          <OverviewCard label={vi.configuration.databaseSettings} value={s.databaseSettings} />
          <OverviewCard label={vi.configuration.pendingChanges} value={s.pendingChanges} />
          <OverviewCard
            label={vi.configuration.lastModified}
            value={s.lastModifiedAt ? formatDateTime(s.lastModifiedAt) : '—'}
          />
          <OverviewCard label={vi.configuration.productionReadiness} value={s.productionReady ? vi.configuration.ready : vi.configuration.notReady} tone={s.productionReady ? 'ok' : 'warn'} />
        </div>
      )}

      {data?.warnings && <ConfigurationDependencies warnings={data.warnings} />}

      {data?.modules && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold">{vi.configuration.modules}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.modules.map((m) => (
              <Link
                key={m.id}
                href={m.href}
                className="flex items-center justify-between rounded-xl border border-zinc-100 p-4 hover:border-admin-300 hover:bg-zinc-50"
              >
                <span className="font-medium text-zinc-800">{m.label}</span>
                <ConfigurationStatusBadge status={m.status} />
              </Link>
            ))}
          </div>
        </Card>
      )}

      <ConfigurationIntegrationsPanel />
    </div>
  );
}
