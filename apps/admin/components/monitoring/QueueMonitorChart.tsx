'use client';

import { cn } from '@/lib/utils';

export interface QueueChartBucket {
  label: string;
  completed: number;
  failed: number;
  retry?: number;
  waiting?: number;
}

export function QueueMonitorChart({
  title,
  buckets,
  className,
}: {
  title: string;
  buckets: QueueChartBucket[];
  className?: string;
}) {
  const max = Math.max(
    1,
    ...buckets.map((b) => b.completed + b.failed + (b.retry ?? 0)),
  );

  return (
    <div className={cn('space-y-2', className)}>
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      <div className="flex h-36 items-end gap-0.5 overflow-x-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2">
        {buckets.map((bucket) => {
          const total = bucket.completed + bucket.failed;
          return (
            <div
              key={bucket.label}
              className="flex min-w-[10px] flex-1 flex-col items-center justify-end"
              title={`${bucket.label}: ${bucket.completed} ok, ${bucket.failed} fail`}
            >
              <div className="flex w-full flex-col justify-end" style={{ height: '100%' }}>
                {bucket.failed > 0 && (
                  <div
                    className="w-full bg-red-400"
                    style={{
                      height: `${Math.round((bucket.failed / max) * 100)}%`,
                      minHeight: 2,
                    }}
                  />
                )}
                {bucket.completed > 0 && (
                  <div
                    className="w-full bg-green-500"
                    style={{
                      height: `${Math.round((bucket.completed / max) * 100)}%`,
                      minHeight: 2,
                    }}
                  />
                )}
                {total === 0 && <div className="h-0.5 w-full bg-zinc-200" />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-green-500" /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded bg-red-400" /> Failed
        </span>
      </div>
    </div>
  );
}

export function JobTimelineView({
  steps,
}: {
  steps: Array<{ step: string; label: string; at: string | null; durationMs: number | null }>;
}) {
  return (
    <div className="relative space-y-0 pl-6">
      {steps.map((step, i) => (
        <div key={`${step.step}-${i}`} className="relative pb-4">
          {i < steps.length - 1 && (
            <span className="absolute left-[-18px] top-3 h-full w-0.5 bg-zinc-200" />
          )}
          <span
            className={cn(
              'absolute left-[-22px] top-1 h-3 w-3 rounded-full border-2 border-white',
              step.step === 'failed' ? 'bg-red-500' : step.step === 'completed' ? 'bg-green-500' : step.step === 'retry' ? 'bg-orange-400' : 'bg-admin-500',
            )}
          />
          <p className="text-sm font-medium text-zinc-800">{step.label}</p>
          <p className="text-xs text-zinc-500">
            {step.at ?? '—'}
            {step.durationMs != null ? ` · ${step.durationMs} ms` : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

export function HealthBadge({ health }: { health: string }) {
  const cls =
    health === 'HEALTHY'
      ? 'bg-green-100 text-green-800'
      : health === 'WARNING'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-red-100 text-red-800';
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', cls)}>{health}</span>
  );
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ConfigReadonlyPanel({ config }: { config: Record<string, unknown> }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
      {prettyJson(config)}
    </pre>
  );
}
