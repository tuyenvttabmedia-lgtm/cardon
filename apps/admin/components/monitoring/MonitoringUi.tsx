'use client';

import Link from 'next/link';
import { EmptyState, LoadingState, StatCard } from '@/components/ui/Display';
import { SectionHeader } from '@/components/ui/PageHeader';
import { TabStrip } from '@/components/ui/Navigation';
import { vi } from '@/lib/i18n/vi';

export function MonitoringBreadcrumb({
  sectionLabel,
}: {
  sectionLabel?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link href="/monitoring" className="hover:text-admin-700">
            {vi.monitoringHub.title}
          </Link>
        </li>
        {sectionLabel && (
          <>
            <li aria-hidden className="text-slate-300">/</li>
            <li className="font-medium text-slate-800">{sectionLabel}</li>
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
  return <SectionHeader title={title} subtitle={subtitle} />;
}

export function MonitoringFilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {children}
    </div>
  );
}

export function MonitoringActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
      {children}
    </div>
  );
}

export function MonitoringEmptyState({ message }: { message?: string }) {
  return <EmptyState message={message ?? vi.monitoringHub.empty} />;
}

export function MonitoringLoadingState({ message }: { message?: string }) {
  return <LoadingState message={message ?? vi.app.loading} />;
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
  const statTone =
    tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : tone === 'error' ? 'danger' : 'default';

  return <StatCard label={title} value={value} hint={hint} tone={statTone} href={href} />;
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
    <TabStrip
      items={items}
      active={active}
      onSelect={onSelect}
      ariaLabel="Bộ lọc nhanh"
      className="inline-flex"
    />
  );
}
