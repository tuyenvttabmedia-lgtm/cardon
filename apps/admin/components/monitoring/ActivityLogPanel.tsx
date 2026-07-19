'use client';

import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime, ROLE_LABELS } from '@/lib/utils';
import type { SystemActivityLog } from '@/types/api';

const SEVERITY_DOT: Record<string, string> = {
  INFO: 'bg-blue-500',
  SUCCESS: 'bg-green-500',
  WARNING: 'bg-yellow-500',
  ERROR: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

export function ActivityLogDrawer({
  log,
  onClose,
}: {
  log: SystemActivityLog | null;
  onClose: () => void;
}) {
  if (!log) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label={vi.common.close}
        onClick={onClose}
      />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="text-lg font-semibold">{vi.activityLog.detailTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            {vi.common.close}
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="text-zinc-500">{vi.activityLog.titleLabel}</dt>
              <dd className="font-medium">{log.title}</dd>
            </div>
            {log.description && (
              <div className="col-span-2">
                <dt className="text-zinc-500">{vi.activityLog.description}</dt>
                <dd>{log.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-zinc-500">{vi.activityLog.severity}</dt>
              <dd className="font-medium">{log.severity}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.activityLog.category}</dt>
              <dd className="font-medium">{log.eventCategory}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.activityLog.event}</dt>
              <dd className="font-mono text-xs">{log.eventType}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.audit.time}</dt>
              <dd>{formatDateTime(log.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.audit.user}</dt>
              <dd>{log.performedEmail ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.activityLog.source}</dt>
              <dd>{log.source}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IP</dt>
              <dd className="font-mono text-xs">{log.ipAddress ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">Correlation ID</dt>
              <dd className="break-all font-mono text-xs">{log.correlationId ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">User Agent</dt>
              <dd className="break-all text-xs text-zinc-600">{log.userAgent ?? '—'}</dd>
            </div>
          </dl>
          <div>
            <h4 className="mb-2 font-semibold text-zinc-700">Metadata</h4>
            <pre className="max-h-64 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
              {JSON.stringify(log.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </aside>
    </>
  );
}

export function ActivitySeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[severity] ?? 'bg-zinc-400')}
      aria-hidden
    />
  );
}

export function ActivityTimelineItem({
  log,
  onClick,
}: {
  log: SystemActivityLog;
  onClick: () => void;
}) {
  const time = new Date(log.createdAt).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full gap-3 border-b border-zinc-100 py-3 text-left hover:bg-zinc-50"
    >
      <div className="w-12 shrink-0 pt-0.5 text-xs text-zinc-500">{time}</div>
      <ActivitySeverityDot severity={log.severity} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-zinc-900">{log.title}</p>
        <p className="truncate text-sm text-zinc-500">
          {log.description ?? log.resourceDisplay ?? log.performedEmail ?? log.eventType}
        </p>
      </div>
    </button>
  );
}
