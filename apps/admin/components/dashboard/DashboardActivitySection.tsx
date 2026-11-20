'use client';

import Link from 'next/link';
import { Card, EmptyState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { cn, formatDateTime } from '@/lib/utils';
import { vi } from '@/lib/i18n/vi';
import type { SystemActivityLog } from '@/types/api';

const ALERT_SEVERITIES = new Set(['WARNING', 'ERROR', 'CRITICAL']);

export function filterAlertActivity(items: SystemActivityLog[], take = 8): SystemActivityLog[] {
  return items.filter((row) => ALERT_SEVERITIES.has(row.severity)).slice(0, take);
}

function severityClass(severity: string) {
  if (severity === 'CRITICAL' || severity === 'ERROR') return 'bg-rose-100 text-rose-700';
  if (severity === 'WARNING') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
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
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">{vi.dashboard.activityColTime}</th>
                  <th className="px-4 py-2.5 font-medium">{vi.dashboard.activityColSeverity}</th>
                  <th className="px-4 py-2.5 font-medium">{vi.dashboard.activityColTitle}</th>
                  <th className="px-4 py-2.5 font-medium">{vi.dashboard.activityColResource}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold',
                          severityClass(row.severity),
                        )}
                      >
                        {row.severity}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate px-4 py-2.5 font-medium text-slate-900">
                      {row.title}
                      {row.eventCategory ? (
                        <span className="ml-1 font-normal text-slate-400">· {row.eventCategory}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-slate-500">
                      {row.resourceDisplay || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </SectionShell>
  );
}
