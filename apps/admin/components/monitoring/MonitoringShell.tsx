'use client';

import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SectionNav } from '@/components/ui/Navigation';
import { MonitoringGlobalSearch } from '@/components/monitoring/MonitoringGlobalSearch';
import {
  MonitoringBreadcrumb,
  MonitoringLoadingState,
} from '@/components/monitoring/MonitoringUi';
import { MONITORING_SECTIONS, monitoringSectionFromPath } from '@/lib/monitoring-routes';
import { vi } from '@/lib/i18n/vi';

function MonitoringNav() {
  const pathname = usePathname();
  const { can } = useAuth();

  const visible = MONITORING_SECTIONS.filter((item) => !('permission' in item) || can(item.permission));

  return (
    <SectionNav
      ariaLabel="Điều hướng giám sát"
      items={visible.map((item) => {
        const active =
          'exact' in item && item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return { href: item.href, label: item.label, active };
      })}
    />
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
    can('notification.read') ||
    can('monitoring.server.read');

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
        <h1 className="admin-page-title">
          {isOverview ? vi.monitoringHub.title : section?.label ?? vi.monitoringHub.title}
        </h1>
        <p className="admin-page-subtitle">
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
