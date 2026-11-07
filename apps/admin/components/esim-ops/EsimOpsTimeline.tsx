'use client';

import { formatDateTime, cn } from '@/lib/utils';
import type { TimelineStep } from './esim-ops-ui';

const STATE_DOT: Record<TimelineStep['state'], string> = {
  done: 'border-emerald-500 bg-emerald-500',
  current: 'border-admin-500 bg-admin-500 ring-4 ring-admin-100',
  todo: 'border-slate-300 bg-white',
  failed: 'border-red-500 bg-red-500',
};

const STATE_LABEL: Record<TimelineStep['state'], string> = {
  done: 'Hoàn tất',
  current: 'Đang xử lý',
  todo: 'Chờ',
  failed: 'Lỗi',
};

export function EsimOpsTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        return (
          <li key={step.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? (
              <span
                className={cn(
                  'absolute left-[7px] top-4 h-[calc(100%-0.5rem)] w-px',
                  step.state === 'done' ? 'bg-emerald-200' : 'bg-slate-200',
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn('relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2', STATE_DOT[step.state])}
              title={STATE_LABEL[step.state]}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium text-slate-900">{step.title}</p>
                <span className="text-[11px] text-slate-400">{STATE_LABEL[step.state]}</span>
              </div>
              {step.at ? (
                <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(step.at)}</p>
              ) : (
                <p className="mt-0.5 text-xs text-slate-400">Chưa có bằng chứng thời gian</p>
              )}
              {step.note ? (
                <p className="mt-1 truncate font-mono text-xs text-slate-600" title={step.note}>
                  {step.note}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
