'use client';

import { DetailDrawer } from '@/components/ui/Dialog';
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
  return (
    <DetailDrawer open={Boolean(log)} onClose={onClose} title={vi.activityLog.detailTitle}>
      {log && (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="text-slate-500">{vi.activityLog.titleLabel}</dt>
              <dd className="font-medium">{log.title}</dd>
            </div>
            {log.description && (
              <div className="col-span-2">
                <dt className="text-slate-500">{vi.activityLog.description}</dt>
                <dd>{log.description}</dd>
              </div>
            )}
            <div>
              <dt className="text-slate-500">{vi.activityLog.severity}</dt>
              <dd className="font-medium">{log.severity}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.activityLog.category}</dt>
              <dd className="font-medium">{log.eventCategory}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.activityLog.event}</dt>
              <dd className="font-mono text-xs">{log.eventType}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.audit.time}</dt>
              <dd>{formatDateTime(log.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.audit.user}</dt>
              <dd>{log.performedEmail ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.activityLog.source}</dt>
              <dd>{log.source}</dd>
            </div>
            <div>
              <dt className="text-slate-500">IP</dt>
              <dd className="font-mono text-xs">{log.ipAddress ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">Correlation ID</dt>
              <dd className="break-all font-mono text-xs">{log.correlationId ?? '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-500">User Agent</dt>
              <dd className="break-all text-xs text-slate-600">{log.userAgent ?? '—'}</dd>
            </div>
          </dl>
          <div>
            <h4 className="mb-2 font-semibold text-slate-700">Metadata</h4>
            <pre className="max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              {JSON.stringify(log.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </DetailDrawer>
  );
}

export function ActivitySeverityDot({ severity }: { severity: string }) {
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', SEVERITY_DOT[severity] ?? 'bg-slate-400')}
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
      className="flex w-full gap-3 border-b border-slate-100 py-3 text-left hover:bg-slate-50"
    >
      <div className="w-12 shrink-0 pt-0.5 text-xs text-slate-500">{time}</div>
      <ActivitySeverityDot severity={log.severity} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">{log.title}</p>
        <p className="truncate text-sm text-slate-500">
          {log.description ?? log.resourceDisplay ?? log.performedEmail ?? log.eventType}
        </p>
      </div>
    </button>
  );
}
