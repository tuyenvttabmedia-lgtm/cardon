'use client';

import { useDateTime, useT } from '@/components/i18n/LocaleProvider';
import type { MessageKey } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import type { OrderTimelineStep } from '@/types/api';

function stepIcon(state: OrderTimelineStep['state']) {
  if (state === 'completed') return '✓';
  if (state === 'active') return '⏳';
  return '○';
}

const TIMELINE_KEYS: Record<string, MessageKey> = {
  'Thanh toán thành công': 'timeline.payOk',
  'Chờ thanh toán': 'timeline.waitPay',
  'Đang lấy mã cài eSIM': 'timeline.fetchEsim',
  'Đã có mã cài': 'timeline.esimReady',
  'Hoàn thành': 'timeline.done',
  'Đang lấy mã thẻ': 'timeline.fetchCard',
  'Đã nhận mã thẻ': 'timeline.cardReady',
  'Email đã gửi': 'timeline.emailSent',
  'Đang gửi yêu cầu nạp': 'timeline.topupSend',
  'Nhà mạng xác nhận': 'timeline.telco',
};

export function OrderTimeline({ steps }: { steps: OrderTimelineStep[] }) {
  const t = useT();
  const formatWhen = useDateTime();
  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6">
      <h2 className="text-lg font-semibold text-cardon-navy">{t('order.timeline')}</h2>
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
                {TIMELINE_KEYS[step.label] ? t(TIMELINE_KEYS[step.label]) : step.label}
              </p>
              {step.at && (
                <p className="mt-0.5 text-xs text-cardon-gray">
                  {formatWhen(step.at)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
