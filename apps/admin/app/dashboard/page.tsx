'use client';



import Link from 'next/link';

import { useEffect, useState } from 'react';

import { RequirePermission } from '@/components/layout/AdminShell';

import { StatCard, Card, ErrorMessage, Badge } from '@/components/ui/Display';

import { vi } from '@/lib/i18n/vi';

import { adminApi, systemHealthApi, ApiClientError } from '@/services/api-client';

import { formatDateTime, formatVnd } from '@/lib/utils';

import type { DashboardStats, SystemHealthSummary } from '@/types/api';



export default function DashboardPage() {

  const [stats, setStats] = useState<DashboardStats | null>(null);

  const [health, setHealth] = useState<SystemHealthSummary | null>(null);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    Promise.all([adminApi.getDashboard(), systemHealthApi.getHealth()])

      .then(([dashboard, healthSummary]) => {

        setStats(dashboard);

        setHealth(healthSummary);

      })

      .catch((err) =>

        setError(err instanceof ApiClientError ? err.message : vi.dashboard.loadError),

      );

  }, []);



  return (

    <RequirePermission permission="admin.dashboard">

      <div className="space-y-6">

        <div>

          <h1 className="text-2xl font-bold">{vi.dashboard.title}</h1>

          {stats?.asOf && (

            <p className="text-sm text-zinc-500">{vi.common.updatedAt}: {formatDateTime(stats.asOf)}</p>

          )}

        </div>

        {error && <ErrorMessage message={error} />}

        {stats && (

          <>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

              <Link href="/configuration/health" className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-admin-400">

                <p className="text-sm text-zinc-500">System Health</p>

                <p className="mt-1 text-3xl font-bold">{health?.healthScore ?? 100}%</p>

                <p className="text-sm font-medium text-zinc-700">{health?.productionLabel ?? 'Production Ready'}</p>

                {health?.systemVersion && (
                  <div className="mt-2 space-y-1 text-xs text-zinc-600">
                    <p>Current Version: <strong>{health.systemVersion.build}</strong></p>
                    <p>Database Migration: {health.systemVersion.database.migrationCount}</p>
                    <p>
                      Services: API {health.systemVersion.services.api.status === 'ok' ? '✓' : '⚠'}
                      {' · '}WEB {health.systemVersion.services.web.status === 'ok' ? '✓' : '⚠'}
                      {' · '}ADMIN {health.systemVersion.services.admin.status === 'ok' ? '✓' : '⚠'}
                      {' · '}WORKER {health.systemVersion.services.worker.status === 'ok' ? '✓' : '⚠'}
                    </p>
                    {health.versionMismatch && (
                      <Badge tone="warning">{vi.settings.versionMismatch}</Badge>
                    )}
                  </div>
                )}

                <p className="mt-1 text-xs text-zinc-500">Last Scan: {health?.lastScanAt ? formatDateTime(health.lastScanAt) : '—'}</p>

                <p className="text-sm text-admin-600">View Report →</p>

              </Link>

              <StatCard label={vi.dashboard.todayRevenue} value={formatVnd(stats.todayRevenue)} />

              <StatCard label={vi.dashboard.todayOrders} value={String(stats.ordersCount)} />

              <StatCard label={vi.dashboard.successfulPayments} value={String(stats.successfulPayments)} />

            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

              <StatCard label={vi.dashboard.failedPayments} value={String(stats.failedPayments)} />

              <StatCard label={vi.dashboard.pendingFulfillment} value={String(stats.pendingFulfillment)} />

              <StatCard label={vi.dashboard.providerErrors} value={String(stats.providerErrors)} />

            </div>

            <Card>

              <h2 className="font-semibold">{vi.dashboard.agentStats}</h2>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-5">

                <div><dt className="text-zinc-500">{vi.dashboard.total}</dt><dd className="text-xl font-bold">{stats.agentStatistics.total}</dd></div>

                <div><dt className="text-zinc-500">{vi.dashboard.active}</dt><dd className="text-xl font-bold text-emerald-600">{stats.agentStatistics.active}</dd></div>

                <div><dt className="text-zinc-500">{vi.dashboard.pendingKyc}</dt><dd className="text-xl font-bold text-amber-600">{stats.agentStatistics.pendingKyc}</dd></div>

                <div><dt className="text-zinc-500">{vi.dashboard.suspended}</dt><dd className="text-xl font-bold text-red-600">{stats.agentStatistics.suspended}</dd></div>

                <div><dt className="text-zinc-500">{vi.dashboard.rejected}</dt><dd className="text-xl font-bold">{stats.agentStatistics.rejected}</dd></div>

              </dl>

            </Card>

          </>

        )}

      </div>

    </RequirePermission>

  );

}

