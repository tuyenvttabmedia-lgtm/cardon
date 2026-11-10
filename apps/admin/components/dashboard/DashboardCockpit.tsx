'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardHealthSection } from '@/components/dashboard/DashboardHealthSection';
import { DashboardBusinessSection } from '@/components/dashboard/DashboardBusinessSection';
import { DashboardOrderOpsSection } from '@/components/dashboard/DashboardOrderOpsSection';
import { DashboardPayProviderSection } from '@/components/dashboard/DashboardPayProviderSection';
import { DashboardAgentSection } from '@/components/dashboard/DashboardAgentSection';
import {
  DashboardActivitySection,
  filterAlertActivity,
} from '@/components/dashboard/DashboardActivitySection';
import { useAuth } from '@/hooks/useAuth';
import { LatestRequestTracker } from '@/lib/latest-request';
import { vi } from '@/lib/i18n/vi';
import {
  adminApi,
  systemActivityApi,
  systemHealthApi,
  ApiClientError,
} from '@/services/api-client';
import type {
  DashboardAgentStatistics,
  DashboardBacklog,
  DashboardBusinessStats,
  DashboardPaymentAttempts,
  DashboardPeriodInfo,
  DashboardPeriodPreset,
  DashboardStats,
  SystemActivityLog,
  SystemHealthSummary,
} from '@/types/api';

type LoadKey = 'metrics' | 'health' | 'activity';

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.message : fallback;
}

export function DashboardCockpit() {
  const { can } = useAuth();
  const trackerRef = useRef(new LatestRequestTracker<LoadKey>());

  const [period, setPeriod] = useState<DashboardPeriodPreset>('today');
  const [periodInfo, setPeriodInfo] = useState<DashboardPeriodInfo | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);

  const [business, setBusiness] = useState<DashboardBusinessStats | null>(null);
  const [payments, setPayments] = useState<DashboardPaymentAttempts | null>(null);
  const [providerErrors, setProviderErrors] = useState<number | null>(null);
  const [providerErrorsScope, setProviderErrorsScope] = useState<'SYSTEM' | null>(null);
  const [backlog, setBacklog] = useState<DashboardBacklog | null>(null);
  const [agents, setAgents] = useState<DashboardAgentStatistics | null>(null);

  const [metricsLoading, setMetricsLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [health, setHealth] = useState<SystemHealthSummary | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const canActivity = can('activity.read');
  const [activityVisible, setActivityVisible] = useState(false);
  const [activityItems, setActivityItems] = useState<SystemActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const applyFullMetrics = useCallback((data: DashboardStats) => {
    setPeriodInfo(data.period);
    setAsOf(data.asOf);
    setBusiness(data.business);
    setPayments(data.payments);
    setProviderErrors(data.providerErrors);
    setProviderErrorsScope(data.providerErrorsScope);
    setBacklog(data.backlog);
    setAgents(data.agentStatistics);
  }, []);

  /** Period change: update period-bound KPIs only; keep backlog/agent snapshot. */
  const applyPeriodMetrics = useCallback((data: DashboardStats) => {
    setPeriodInfo(data.period);
    setAsOf(data.asOf);
    setBusiness(data.business);
    setPayments(data.payments);
    setProviderErrors(data.providerErrors);
    setProviderErrorsScope(data.providerErrorsScope);
  }, []);

  const loadMetrics = useCallback(
    async (nextPeriod: DashboardPeriodPreset, mode: 'full' | 'period') => {
      const token = trackerRef.current.begin('metrics');
      if (mode === 'full') setMetricsLoading(true);
      else setPeriodLoading(true);
      setMetricsError(null);
      try {
        const data = await adminApi.getDashboard(nextPeriod);
        if (!trackerRef.current.isLatest(token)) return;
        if (mode === 'full') applyFullMetrics(data);
        else applyPeriodMetrics(data);
      } catch (err) {
        if (!trackerRef.current.isLatest(token)) return;
        setMetricsError(errMessage(err, vi.dashboard.loadError));
        if (mode === 'full') {
          setBusiness(null);
          setPayments(null);
          setProviderErrors(null);
          setProviderErrorsScope(null);
          setBacklog(null);
          setAgents(null);
        }
      } finally {
        if (trackerRef.current.isLatest(token)) {
          setMetricsLoading(false);
          setPeriodLoading(false);
        }
      }
    },
    [applyFullMetrics, applyPeriodMetrics],
  );

  const loadHealth = useCallback(async () => {
    const token = trackerRef.current.begin('health');
    setHealthLoading(true);
    setHealthError(null);
    try {
      const summary = await systemHealthApi.getHealth();
      if (!trackerRef.current.isLatest(token)) return;
      setHealth(summary);
    } catch (err) {
      if (!trackerRef.current.isLatest(token)) return;
      setHealth(null);
      setHealthError(errMessage(err, vi.dashboard.healthLoadError));
    } finally {
      if (trackerRef.current.isLatest(token)) setHealthLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    if (!can('activity.read')) {
      setActivityVisible(false);
      setActivityItems([]);
      return;
    }
    const token = trackerRef.current.begin('activity');
    setActivityLoading(true);
    try {
      const data = await systemActivityApi.list({ limit: 20, sort: 'newest', page: 1 });
      if (!trackerRef.current.isLatest(token)) return;
      setActivityVisible(true);
      setActivityItems(filterAlertActivity(data.items));
    } catch {
      if (!trackerRef.current.isLatest(token)) return;
      // 403 or failure → hide optional section (no fake rows).
      setActivityVisible(false);
      setActivityItems([]);
    } finally {
      if (trackerRef.current.isLatest(token)) setActivityLoading(false);
    }
  }, [can]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    trackerRef.current.invalidateAll();
    await Promise.all([loadMetrics(period, 'full'), loadHealth(), loadActivity()]);
    setRefreshing(false);
  }, [loadActivity, loadHealth, loadMetrics, period]);

  useEffect(() => {
    void loadMetrics('today', 'full');
    void loadHealth();
    void loadActivity();
  }, [loadActivity, loadHealth, loadMetrics]);

  async function handlePeriodChange(next: DashboardPeriodPreset) {
    if (next === period) return;
    setPeriod(next);
    await loadMetrics(next, 'period');
  }

  const metricsBusy = metricsLoading || periodLoading;
  const canMonitoring =
    can('activity.read') ||
    can('webhook.read') ||
    can('queue.read') ||
    can('notification.read') ||
    can('monitoring.server.read');

  return (
    <div className="space-y-6 overflow-x-hidden">
      <DashboardHeader
        period={period}
        asOf={asOf}
        refreshing={refreshing || metricsBusy || healthLoading}
        onPeriodChange={(p) => void handlePeriodChange(p)}
        onRefresh={() => void refreshAll()}
      />

      <DashboardHealthSection
        health={health}
        loading={healthLoading}
        error={healthError}
        canOpenReport={can('settings.manage')}
        canOpenMonitoring={canMonitoring}
        onRetry={() => void loadHealth()}
      />

      <DashboardBusinessSection
        period={periodInfo}
        business={business}
        payments={payments}
        loading={metricsBusy && !business}
        error={metricsError && !business ? metricsError : null}
        onRetry={() => void loadMetrics(period, 'full')}
      />

      <DashboardOrderOpsSection
        backlog={backlog}
        loading={metricsLoading && !backlog}
        error={metricsError && !backlog ? metricsError : null}
        onRetry={() => void loadMetrics(period, 'full')}
      />

      <DashboardPayProviderSection
        failedAttemptCount={payments?.failedAttemptCount ?? null}
        providerErrors={providerErrors}
        providerErrorsScope={providerErrorsScope}
        loading={metricsBusy && payments == null}
        error={metricsError && payments == null ? metricsError : null}
        canPayments={can('payments.view')}
        canProviders={can('providers.manage')}
        canOperations={can('reconciliation.read') || can('finance.view') || can('operations.manage')}
        onRetry={() => void loadMetrics(period, 'full')}
      />

      <DashboardAgentSection
        agents={agents}
        loading={metricsLoading && !agents}
        error={metricsError && !agents ? metricsError : null}
        canAgents={can('users.read')}
        onRetry={() => void loadMetrics(period, 'full')}
      />

      <DashboardActivitySection
        visible={canActivity && activityVisible}
        items={activityItems}
        loading={activityLoading}
        onRetry={() => void loadActivity()}
      />
    </div>
  );
}
