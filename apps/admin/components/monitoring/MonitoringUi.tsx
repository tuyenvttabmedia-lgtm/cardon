'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';

export function MonitoringBreadcrumb({
  sectionLabel,
}: {
  sectionLabel?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/monitoring" className="hover:text-admin-700">
            {vi.monitoringHub.title}
          </Link>
        </li>
        {sectionLabel && (
          <>
            <li aria-hidden className="text-zinc-300">/</li>
            <li className="font-medium text-zinc-800">{sectionLabel}</li>
          </>
        )}
      </ol>
    </nav>
  );
}

export function MonitoringSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
    </div>
  );
}

export function MonitoringFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

export function MonitoringActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
      {children}
    </div>
  );
}

export function MonitoringEmptyState({ message }: { message?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-6 py-12 text-center">
      <p className="text-sm text-zinc-500">{message ?? vi.monitoringHub.empty}</p>
    </div>
  );
}

export function MonitoringLoadingState({ message }: { message?: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-6 py-16">
      <p className="text-sm text-zinc-500">{message ?? vi.app.loading}</p>
    </div>
  );
}

export function MonitoringHealthCard({
  title,
  value,
  hint,
  href,
  tone = 'default',
}: {
  title: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: 'default' | 'ok' | 'warn' | 'error';
}) {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'error'
          ? 'text-red-700'
          : 'text-zinc-900';

  const body = (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-admin-200 hover:shadow-sm">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className={cn('mt-1 text-2xl font-bold', toneClass)}>{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }

  return body;
}

export function MonitoringQuickFilters({
  items,
  active,
  onSelect,
}: {
  items: Array<{ id: string; label: string }>;
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.id)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            active === item.id
              ? 'bg-admin-100 text-admin-800'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
