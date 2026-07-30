'use client';

import { Badge } from '@/components/ui/Display';
import { vi } from '@/lib/i18n/vi';

type BadgeTone = 'success' | 'warning' | 'default';

const STATUS_TONE: Record<string, BadgeTone> = {
  configured: 'success',
  production_ready: 'success',
  needs_attention: 'warning',
  warning: 'warning',
  disabled: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  configured: vi.configuration.statusConfigured,
  production_ready: vi.configuration.statusProductionReady,
  needs_attention: vi.configuration.statusNeedsAttention,
  warning: vi.configuration.statusWarning,
  disabled: vi.configuration.statusDisabled,
};

export function ConfigurationStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONE[status] ?? 'warning'}>{STATUS_LABEL[status] ?? status}</Badge>
  );
}

export function ConfigurationDependencies({ warnings }: { warnings: Array<{ id: string; message: string; severity: string }> }) {
  if (!warnings.length) return null;
  return (
    <div className="space-y-2 rounded-xl border border-yellow-200 bg-yellow-50 p-4">
      <p className="text-sm font-semibold text-yellow-900">{vi.configuration.dependencies}</p>
      <ul className="space-y-1 text-sm text-yellow-800">
        {warnings.map((w) => (
          <li key={w.id}>{w.message}</li>
        ))}
      </ul>
    </div>
  );
}
