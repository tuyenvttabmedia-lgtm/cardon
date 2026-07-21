'use client';

import { cn } from '@/lib/utils';
import type { OrderTimelineStep } from '@/types/api';

function stepIcon(state: OrderTimelineStep['state']) {
  if (state === 'completed') return '✓';
  if (state === 'active') return '⏳';
  return '○';
}

export function OrderTimeline({ steps }: { steps: OrderTimelineStep[] }) {
  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-semibold text-cardon-navy">Tiến trình đơn hàng</h2>
      <ol className="mt-4 space-y-0">
        {steps.map((step, index) => (
          <li key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  step.state === 'completed' && 'bg-green-100 text-green-700',
                  step.state === 'active' && 'bg-amber-100 text-amber-700',
                  step.state === 'pending' && 'bg-cardon-light text-cardon-gray',
                )}
                aria-hidden
              >
                {stepIcon(step.state)}
              </span>
              {index < steps.length - 1 && (
                <span className="my-1 min-h-6 w-px flex-1 bg-cardon-border" aria-hidden />
              )}
            </div>
            <div className={cn('pb-6', index === steps.length - 1 && 'pb-0')}>
              <p
                className={cn(
                  'text-sm font-medium',
                  step.state === 'completed' && 'text-cardon-navy',
                  step.state === 'active' && 'text-amber-800',
                  step.state === 'pending' && 'text-cardon-gray',
                )}
              >
                {step.label}
              </p>
              {step.at && (
                <p className="mt-0.5 text-xs text-cardon-gray">
                  {new Date(step.at).toLocaleString('vi-VN')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
