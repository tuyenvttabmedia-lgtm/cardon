'use client';

import { useMemo } from 'react';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime, ROLE_LABELS } from '@/lib/utils';
import type { SystemAuditLog } from '@/types/api';

const MASK = '********';

function isMasked(value: unknown): boolean {
  return value === MASK;
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function DiffBlock({
  title,
  value,
  compareValue,
  mode,
}: {
  title: string;
  value: unknown;
  compareValue?: unknown;
  mode: 'old' | 'new';
}) {
  const entries = useMemo(() => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [{ key: 'value', val: value }];
    }
    return Object.entries(value as Record<string, unknown>).map(([key, val]) => ({
      key,
      val,
    }));
  }, [value]);

  const compareObj =
    compareValue && typeof compareValue === 'object' && !Array.isArray(compareValue)
      ? (compareValue as Record<string, unknown>)
      : {};

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h4>
      <pre className="max-h-72 overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs leading-relaxed">
        {entries.map(({ key, val }) => {
          const otherVal = compareObj[key];
          const removed = mode === 'old' && otherVal === undefined && val !== undefined;
          const added = mode === 'new' && otherVal === undefined && val !== undefined;
          const changed =
            !removed &&
            !added &&
            otherVal !== undefined &&
            JSON.stringify(otherVal) !== JSON.stringify(val);

          return (
            <div
              key={key}
              className={cn(
                'rounded px-1',
                removed && 'bg-red-100 text-red-800',
                added && 'bg-green-100 text-green-800',
                changed && 'bg-yellow-100 text-yellow-900',
              )}
            >
              <span className="text-zinc-500">{key}: </span>
              {isMasked(val) ? MASK : prettyJson(val).replace(/\n/g, ' ')}
            </div>
          );
        })}
        {entries.length === 0 && <span className="text-zinc-400">—</span>}
      </pre>
    </div>
  );
}

export function AuditLogDrawer({
  log,
  onClose,
}: {
  log: SystemAuditLog | null;
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
          <h3 className="text-lg font-semibold">{vi.systemAudit.detailTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
          >
            {vi.common.close}
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-zinc-500">{vi.systemAudit.resource}</dt>
              <dd className="font-medium">{log.resourceName ?? log.resource}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.audit.action}</dt>
              <dd className="font-medium">{log.action}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.audit.user}</dt>
              <dd className="font-medium">{log.performedEmail}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.systemAudit.role}</dt>
              <dd className="font-medium">{ROLE_LABELS[log.performedRole] ?? log.performedRole}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-zinc-500">{vi.audit.time}</dt>
              <dd className="font-medium">{formatDateTime(log.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">IP</dt>
              <dd className="font-mono text-xs">{log.ipAddress ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{vi.systemAudit.session}</dt>
              <dd className="truncate font-mono text-xs">{log.sessionId ?? '—'}</dd>
            </div>
            {log.reason && (
              <div className="col-span-2">
                <dt className="text-zinc-500">{vi.systemAudit.reason}</dt>
                <dd>{log.reason}</dd>
              </div>
            )}
          </dl>

          <div className="grid gap-4">
            <DiffBlock
              title={vi.systemAudit.oldValue}
              value={log.oldValue}
              compareValue={log.newValue}
              mode="old"
            />
            <div className="text-center text-zinc-400">↓</div>
            <DiffBlock
              title={vi.systemAudit.newValue}
              value={log.newValue}
              compareValue={log.oldValue}
              mode="new"
            />
          </div>
        </div>
      </aside>
    </>
  );
}
