'use client';

import { useState } from 'react';
import { ConfigurationAuditBar } from '@/components/configuration/ConfigurationAuditBar';
import { RequireRole } from '@/components/layout/AdminShell';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { configurationCenterApi, ApiClientError } from '@/services/api-client';
import { useAuth } from '@/hooks/useAuth';
import { EXPORTABLE_MODULES } from '@/types/api';

export default function ConfigurationBackupPage() {
  const { user } = useAuth();
  const [module, setModule] = useState<string>('smtp');
  const [importJson, setImportJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  async function exportJson(includeSecrets: boolean) {
    setError(null);
    try {
      const data = await configurationCenterApi.exportModule(module, includeSecrets);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `config-${module}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(vi.configuration.exported);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.app.requestFailed);
    }
  }

  async function importJsonFile() {
    setError(null);
    try {
      const parsed = JSON.parse(importJson) as Record<string, unknown>;
      const payload = (parsed.data ?? parsed) as Record<string, unknown>;
      await configurationCenterApi.importModule(module, {
        data: payload,
        include_secrets: isSuperAdmin && Boolean(parsed.includeSecrets),
      });
      setMessage(vi.configuration.imported);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Invalid JSON');
    }
  }

  return (
    <RequireRole role="SUPER_ADMIN">
      <div className="space-y-6">
        <ConfigurationAuditBar module="backup" />
        {error && <ErrorMessage message={error} />}
        {message && <p className="text-sm text-green-700">{message}</p>}
        <Card className="space-y-4">
          <div>
            <label className="text-sm font-medium">{vi.configuration.module}</label>
            <select className="mt-1 block rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={module} onChange={(e) => setModule(e.target.value)}>
              {EXPORTABLE_MODULES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void exportJson(false)}>{vi.configuration.exportJson}</Button>
            {isSuperAdmin && (
              <Button type="button" variant="secondary" onClick={() => void exportJson(true)}>
                {vi.configuration.exportWithSecrets}
              </Button>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">{vi.configuration.importJson}</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-zinc-200 p-3 font-mono text-xs"
              rows={8}
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
            />
            <Button type="button" className="mt-2" onClick={() => void importJsonFile()}>{vi.configuration.import}</Button>
          </div>
        </Card>
      </div>
    </RequireRole>
  );
}
