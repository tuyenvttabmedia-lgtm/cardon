'use client';

import Link from 'next/link';
import { Card, EmptyState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { SystemActivityLog } from '@/types/api';

const ALERT_SEVERITIES = new Set(['WARNING', 'ERROR', 'CRITICAL']);

export function filterAlertActivity(items: SystemActivityLog[], take = 8): SystemActivityLog[] {
  return items.filter((row) => ALERT_SEVERITIES.has(row.severity)).slice(0, take);
}

export function DashboardActivitySection({
  items,
  loading,
  visible,
  onRetry,
}: {
  items: SystemActivityLog[];
  loading: boolean;
  visible: boolean;
  onRetry: () => void;
}) {
  if (!visible) return null;

  return (
    <SectionShell
      title={vi.dashboard.activityTitle}
      loading={loading}
      error={null}
      onRetry={onRetry}
      skeletonCount={1}
      actions={
        <Link href={DASHBOARD_ROUTES.activity}>
          <Button type="button" variant="ghost" size="sm">
            {vi.dashboard.activityLink} →
          </Button>
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState message={vi.dashboard.activityEmpty} />
      ) : (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-slate-100">
            {items.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium text-slate-900">{row.title}</p>
                  <span className="shrink-0 text-xs text-slate-400">
                    {formatDateTime(row.createdAt)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {row.severity}
                  {row.eventCategory ? ` · ${row.eventCategory}` : ''}
                  {row.resourceDisplay ? ` · ${row.resourceDisplay}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </SectionShell>
  );
}
