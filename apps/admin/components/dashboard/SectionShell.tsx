'use client';

import { Button } from '@/components/ui/Form';
import { ErrorMessage } from '@/components/ui/Display';
import { cn } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';

export function SectionShell({
  title,
  subtitle,
  actions,
  loading,
  error,
  onRetry,
  skeletonCount = 4,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  skeletonCount?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {error ? (
        <div className="space-y-2">
          <ErrorMessage message={error} />
          {onRetry ? (
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              {vi.dashboard.retry}
            </Button>
          ) : null}
        </div>
      ) : loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
