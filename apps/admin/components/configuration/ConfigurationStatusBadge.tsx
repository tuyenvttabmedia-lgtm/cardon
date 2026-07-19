'use client';

import { cn } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';

const STATUS_CLASS: Record<string, string> = {
  configured: 'bg-green-100 text-green-800',
  production_ready: 'bg-green-100 text-green-800',
  needs_attention: 'bg-yellow-100 text-yellow-800',
  warning: 'bg-yellow-100 text-yellow-800',
  disabled: 'bg-zinc-100 text-zinc-600',
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
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', STATUS_CLASS[status] ?? STATUS_CLASS.warning)}>
      {STATUS_LABEL[status] ?? status}
    </span>
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
