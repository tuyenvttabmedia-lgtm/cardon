'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, ErrorMessage } from '@/components/ui/Display';
import {
  MonitoringEmptyState,
  MonitoringHealthCard,
  MonitoringLoadingState,
} from '@/components/monitoring/MonitoringUi';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime } from '@/lib/utils';
import {
  partnerApiLogsApi,
  queueMonitorApi,
  systemActivityApi,
  systemHealthApi,
  systemNotificationApi,
  webhookMonitorApi,
  ApiClientError,
} from '@/services/api-client';
import type { SystemActivityLog, SystemNotification } from '@/types/api';

export function MonitoringDashboard() {
  const { can } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [healthLabel, setHealthLabel] = useState<string>('—');
  const [queueFailed, setQueueFailed] = useState<number | null>(null);
  const [queueRedis, setQueueRedis] = useState<string>('—');
  const [workersOnline, setWorkersOnline] = useState<boolean | null>(null);
  const [webhookFailed, setWebhookFailed] = useState<number | null>(null);
  const [webhookPending, setWebhookPending] = useState<number | null>(null);
  const [apiErrors, setApiErrors] = useState<number | null>(null);
  const [notificationsUnread, setNotificationsUnread] = useState<number | null>(null);
  const [notificationsCritical, setNotificationsCritical] = useState<number | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<SystemNotification[]>([]);
  const [recentActivities, setRecentActivities] = useState<SystemActivityLog[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const tasks: Promise<void>[] = [];

        tasks.push(
          systemHealthApi
            .getHealth()
            .then((h) => {
              if (cancelled) return;
              setHealthScore(h.healthScore);
              setHealthLabel(h.productionLabel ?? vi.monitoringHub.healthReady);
            })
            .catch(() => {
              if (!cancelled) {
                setHealthScore(null);
                setHealthLabel('—');
              }
            }),
        );

        if (can('queue.read')) {
          tasks.push(
            queueMonitorApi.list().then((q) => {
              if (cancelled) return;
              setQueueFailed(q.summary.failedJobs);
              setQueueRedis(q.summary.redisStatus === 'ok' ? vi.monitoringHub.redisOk : vi.monitoringHub.redisError);
              setWorkersOnline(q.summary.workerConnected);
            }),
          );
        }

        if (can('webhook.read')) {
          tasks.push(
            webhookMonitorApi.list({ page: 1, limit: 1 }).then((w) => {
              if (cancelled) return;
              setWebhookFailed(w.summary.failed);
              setWebhookPending(w.summary.pending);
            }),
          );
          tasks.push(
            partnerApiLogsApi.list({ page: 1, limit: 50 }).then((logs) => {
              if (cancelled) return;
              setApiErrors(logs.items.filter((i) => i.httpStatus >= 400).length);
            }).catch(() => {
              if (!cancelled) setApiErrors(0);
            }),
          );
        }

        if (can('notification.read')) {
          tasks.push(
            systemNotificationApi.list({ page: 1, limit: 5, severity: 'CRITICAL', read: false }).then((n) => {
              if (cancelled) return;
              setRecentAlerts(n.items);
              setNotificationsCritical(n.stats.critical);
              setNotificationsUnread(n.stats.unread);
            }),
          );
        }

        if (can('activity.read')) {
          tasks.push(
            systemActivityApi.list({ page: 1, limit: 8, sort: 'newest' }).then((a) => {
              if (cancelled) return;
              setRecentActivities(a.items);
            }),
          );
        }

        await Promise.all(tasks);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof ApiClientError ? e.message : vi.monitoringHub.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [can]);

  if (loading) return <MonitoringLoadingState message={vi.monitoringHub.dashboardLoading} />;

  return (
    <div className="space-y-6">
      {error && <ErrorMessage message={error} />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MonitoringHealthCard
          title={vi.monitoringHub.cardSystemHealth}
          value={healthScore != null ? `${healthScore}%` : '—'}
          hint={healthLabel}
          href="/configuration/health"
          tone={healthScore != null && healthScore >= 80 ? 'ok' : healthScore != null && healthScore >= 50 ? 'warn' : 'error'}
        />
        {can('queue.read') && (
          <>
            <MonitoringHealthCard
              title={vi.monitoringHub.cardQueueHealth}
              value={queueFailed ?? '—'}
              hint={vi.monitoringHub.queueFailedHint}
              href="/monitoring/queues"
              tone={queueFailed != null && queueFailed > 0 ? 'warn' : 'ok'}
            />
            <MonitoringHealthCard
              title={vi.monitoringHub.cardRedis}
              value={queueRedis}
              href="/monitoring/queues"
              tone={queueRedis === vi.monitoringHub.redisOk ? 'ok' : 'error'}
            />
            <MonitoringHealthCard
              title={vi.monitoringHub.cardWorkers}
              value={
                workersOnline == null
                  ? '—'
                  : workersOnline
                    ? vi.monitoringHub.workersOnline
                    : vi.monitoringHub.workersOffline
              }
              href="/monitoring/queues"
              tone={workersOnline ? 'ok' : 'error'}
            />
          </>
        )}
        {can('webhook.read') && (
          <>
            <MonitoringHealthCard
              title={vi.monitoringHub.cardWebhookHealth}
              value={webhookFailed ?? '—'}
              hint={`${vi.monitoringHub.pending}: ${webhookPending ?? 0}`}
              href="/monitoring/webhooks"
              tone={webhookFailed != null && webhookFailed > 0 ? 'warn' : 'ok'}
            />
            <MonitoringHealthCard
              title={vi.monitoringHub.cardApiHealth}
              value={apiErrors ?? '—'}
              hint={vi.monitoringHub.apiErrorsHint}
              href="/monitoring/api-logs"
              tone={apiErrors != null && apiErrors > 0 ? 'warn' : 'ok'}
            />
          </>
        )}
        {can('notification.read') && (
          <MonitoringHealthCard
            title={vi.monitoringHub.cardNotifications}
            value={notificationsUnread ?? '—'}
            hint={`${vi.notificationCenter.critical}: ${notificationsCritical ?? 0}`}
            href="/monitoring/notifications"
            tone={notificationsCritical != null && notificationsCritical > 0 ? 'error' : 'ok'}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900">{vi.monitoringHub.recentAlerts}</h3>
            <Link href="/monitoring/notifications" className="text-sm text-admin-600 hover:underline">
              {vi.monitoringHub.viewAll}
            </Link>
          </div>
          {!can('notification.read') ? (
            <MonitoringEmptyState message={vi.app.noPermissionHint} />
          ) : recentAlerts.length === 0 ? (
            <MonitoringEmptyState message={vi.monitoringHub.noAlerts} />
          ) : (
            <ul className="space-y-2">
              {recentAlerts.map((n) => (
                <li key={n.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                  <p className="font-medium text-zinc-800">{n.title}</p>
                  <p className="text-xs text-zinc-500">{formatDateTime(n.createdAt)} · {n.severity}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-zinc-900">{vi.monitoringHub.recentActivities}</h3>
            <Link href="/monitoring/activity" className="text-sm text-admin-600 hover:underline">
              {vi.monitoringHub.viewAll}
            </Link>
          </div>
          {!can('activity.read') ? (
            <MonitoringEmptyState message={vi.app.noPermissionHint} />
          ) : recentActivities.length === 0 ? (
            <MonitoringEmptyState message={vi.monitoringHub.noActivities} />
          ) : (
            <ul className="space-y-2">
              {recentActivities.map((a) => (
                <li key={a.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                  <p className="font-medium text-zinc-800">{a.title}</p>
                  <p className="text-xs text-zinc-500">
                    {formatDateTime(a.createdAt)} · {a.eventCategory} · {a.severity}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
