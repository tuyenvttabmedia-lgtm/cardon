'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { MonitoringGlobalSearch } from '@/components/monitoring/MonitoringGlobalSearch';
import {
  MonitoringBreadcrumb,
  MonitoringLoadingState,
} from '@/components/monitoring/MonitoringUi';
import { MONITORING_SECTIONS, monitoringSectionFromPath } from '@/lib/monitoring-routes';
import { vi } from '@/lib/i18n/vi';
import { cn } from '@/lib/utils';

function MonitoringNav() {
  const pathname = usePathname();
  const { can } = useAuth();

  const visible = MONITORING_SECTIONS.filter((item) => !('permission' in item) || can(item.permission));

  return (
    <nav className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3">
      {visible.map((item) => {
        const active =
          'exact' in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium',
              active ? 'bg-admin-100 text-admin-800' : 'text-zinc-600 hover:bg-zinc-50',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function MonitoringShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, loading } = useAuth();
  const section = monitoringSectionFromPath(pathname);
  const isOverview = pathname === '/monitoring';

  if (loading) return <MonitoringLoadingState />;

  const hasAccess =
    can('activity.read') ||
    can('webhook.read') ||
    can('queue.read') ||
    can('notification.read');

  if (!hasAccess) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <p className="font-medium text-amber-900">403 — {vi.app.noPermission}</p>
        <p className="mt-1 text-sm text-amber-800">{vi.app.noPermissionHint}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MonitoringBreadcrumb sectionLabel={isOverview ? undefined : section?.label} />

      <div>
        <h1 className="text-2xl font-bold text-zinc-900">
          {isOverview ? vi.monitoringHub.title : section?.label ?? vi.monitoringHub.title}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isOverview ? vi.monitoringHub.subtitle : vi.monitoringHub.sectionHint}
        </p>
      </div>

      <MonitoringNav />

      <Suspense fallback={null}>
        <MonitoringGlobalSearch />
      </Suspense>

      {children}
    </div>
  );
}

export function MonitoringShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<MonitoringLoadingState />}>
      <MonitoringShellInner>{children}</MonitoringShellInner>
    </Suspense>
  );
}
