'use client';

import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/utils';
import type { FinanceDepositDetail } from '@/types/platform';

export function DepositTimeline({ timeline }: { timeline: FinanceDepositDetail['timeline'] }) {
  return (
    <ol className="relative space-y-0">
      {timeline.map((step, i) => (
        <li key={`${step.status}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
          {i < timeline.length - 1 && (
            <span
              className={`absolute left-[7px] top-4 h-full w-px ${step.reached ? 'bg-indigo-300' : 'bg-slate-200'}`}
              aria-hidden
            />
          )}
          <span
            className={`relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
              step.reached ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
            }`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-sm font-medium ${step.reached ? 'text-slate-900' : 'text-slate-400'}`}>
                {step.label}
              </span>
              {step.reached && step.at && (
                <span className="text-xs text-slate-500">{formatDateTime(step.at)}</span>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function DepositStatusBadge({ label, tone }: { label: string; tone?: string }) {
  const map: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
    success: 'success',
    warning: 'warning',
    error: 'danger',
    danger: 'danger',
    neutral: 'default',
    default: 'default',
    info: 'info',
  };
  return <Badge tone={map[tone ?? 'default'] ?? 'default'}>{label}</Badge>;
}

export function DepositCountdown({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    return <p className="text-sm font-medium text-red-600">Đã hết hạn</p>;
  }
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return (
    <p className="text-sm text-slate-600">
      Còn lại:{' '}
      <span className="font-semibold text-indigo-600">
        {min}:{sec.toString().padStart(2, '0')}
      </span>
    </p>
  );
}
