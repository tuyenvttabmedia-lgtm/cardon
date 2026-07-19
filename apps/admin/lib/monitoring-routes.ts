import { vi } from '@/lib/i18n/vi';

export const MONITORING_SECTIONS = [
  { href: '/monitoring', label: vi.monitoringHub.navOverview, exact: true as const },
  { href: '/monitoring/activity', label: vi.monitoringHub.navActivity, permission: 'activity.read' },
  { href: '/monitoring/webhooks', label: vi.monitoringHub.navWebhooks, permission: 'webhook.read' },
  { href: '/monitoring/queues', label: vi.monitoringHub.navQueues, permission: 'queue.read' },
  { href: '/monitoring/api-logs', label: vi.monitoringHub.navApiLogs, permission: 'webhook.read' },
  {
    href: '/monitoring/notifications',
    label: vi.monitoringHub.navNotifications,
    permission: 'notification.read',
  },
] as const;

export function monitoringSectionFromPath(pathname: string) {
  if (pathname === '/monitoring') return MONITORING_SECTIONS[0];
  return MONITORING_SECTIONS.find(
    (s) => !('exact' in s) && (pathname === s.href || pathname.startsWith(`${s.href}/`)),
  );
}

export function resolveMonitoringSearchQuery(raw: string): string {
  const q = raw.trim();
  if (!q) return '/monitoring';

  const encoded = encodeURIComponent(q);

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q)) {
    return `/monitoring/webhooks?id=${encoded}`;
  }

  if (/^req[-_]/i.test(q) || q.toLowerCase().includes('request')) {
    return `/monitoring/api-logs?search=${encoded}`;
  }

  if (/^[0-9]+$/.test(q) && q.length >= 4) {
    return `/monitoring/queues?job_id=${encoded}`;
  }

  if (q.length >= 20) {
    return `/monitoring/webhooks?order_id=${encoded}`;
  }

  return `/monitoring/activity?keyword=${encoded}`;
}
