'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi } from '@/services/api-client';
import type { ConfigurationModuleId } from '@/types/api';

export function ConfigurationAuditBar({ module }: { module: ConfigurationModuleId }) {
  const [meta, setMeta] = useState<{
    lastModifiedAt: string | null;
    modifiedBy: string | null;
    source: string | null;
  } | null>(null);

  useEffect(() => {
    void configurationCenterApi.auditMeta(module).then(setMeta).catch(() => setMeta(null));
  }, [module]);

  if (!meta) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm">
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-600">
        <div>
          <dt className="inline text-zinc-500">{vi.configuration.lastModified}: </dt>
          <dd className="inline">{meta.lastModifiedAt ? formatDateTime(meta.lastModifiedAt) : '—'}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500">{vi.configuration.modifiedBy}: </dt>
          <dd className="inline">{meta.modifiedBy ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500">{vi.configuration.source}: </dt>
          <dd className="inline capitalize">{meta.source ?? '—'}</dd>
        </div>
        <div>
          <dt className="inline text-zinc-500">{vi.configuration.secretsProtected}: </dt>
          <dd className="inline">{vi.configuration.yes}</dd>
        </div>
      </dl>
      <div className="flex gap-2">
        <Link href={`/configuration/audit?module=${module}`} className="text-admin-600 hover:underline">
          {vi.configuration.viewHistory}
        </Link>
      </div>
    </div>
  );
}
