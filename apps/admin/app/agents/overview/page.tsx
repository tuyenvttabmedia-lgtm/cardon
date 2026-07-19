'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, StatCard, ErrorMessage } from '@/components/ui/Display';
import { vi } from '@/lib/i18n/vi';
import { agentCenterApi, ApiClientError } from '@/services/api-client';

export default function AgentsOverviewPage() {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof agentCenterApi.dashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void agentCenterApi
      .dashboard()
      .then(setStats)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : vi.agentCenter.loadError));
  }, []);

  return (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={vi.agentCenter.dashboardTotal} value={String(stats.total)} />
            <StatCard label={vi.agentCenter.dashboardActive} value={String(stats.active)} />
            <StatCard label={vi.agentCenter.dashboardRegisteredToday} value={String(stats.registeredToday)} />
            <StatCard label={vi.agentCenter.dashboardPendingReview} value={String(stats.pendingReview)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label={vi.agentCenter.dashboardNeedMoreInfo} value={String(stats.needMoreInfo)} />
            <StatCard label={vi.agentCenter.dashboardApprovedToday} value={String(stats.approvedToday)} />
            <StatCard label={vi.agentCenter.dashboardRejectedToday} value={String(stats.rejectedToday)} />
            <StatCard label={vi.agentCenter.dashboardKycQueue} value={String(stats.kycQueue)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Chờ KYC (trạng thái)" value={String(stats.pendingKyc)} />
            <StatCard label="Tạm khóa" value={String(stats.suspended)} />
            <StatCard label="API đang bật" value={String(stats.apiEnabledCount)} />
          </div>
          <Card className="flex flex-wrap gap-3">
            <Link href="/agents/list" className="rounded-lg bg-admin-600 px-4 py-2 text-sm font-medium text-white">
              {vi.agentCenter.navList}
            </Link>
            <Link href="/agents/kyc" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium">
              {vi.agentCenter.navOnboarding}
            </Link>
            <Link href="/agents/registration/invite" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium">
              {vi.agentCenter.navRegistrationInvite}
            </Link>
          </Card>
        </>
      )}
    </div>
  );
}
