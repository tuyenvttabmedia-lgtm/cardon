'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { SectionShell } from '@/components/dashboard/SectionShell';
import { DASHBOARD_ROUTES } from '@/components/dashboard/dashboard-links';
import { vi } from '@/lib/i18n/vi';
import type { DashboardAgentStatistics } from '@/types/api';

export function DashboardAgentSection({
  agents,
  loading,
  error,
  canAgents,
  onRetry,
}: {
  agents: DashboardAgentStatistics | null;
  loading: boolean;
  error: string | null;
  canAgents: boolean;
  onRetry: () => void;
}) {
  return (
    <SectionShell
      title={vi.dashboard.agentTitle}
      subtitle={vi.dashboard.agentScope}
      loading={loading}
      error={error}
      onRetry={onRetry}
      skeletonCount={1}
      actions={
        canAgents ? (
          <Link href={DASHBOARD_ROUTES.agentsOverview}>
            <Button type="button" variant="ghost" size="sm">
              {vi.dashboard.agentsLink} →
            </Button>
          </Link>
        ) : null
      }
    >
      {agents ? (
        <Card className="p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <div>
              <dt className="text-slate-500">{vi.dashboard.total}</dt>
              <dd className="text-xl font-bold">{agents.total}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.dashboard.active}</dt>
              <dd className="text-xl font-bold text-emerald-700">{agents.active}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.dashboard.pendingKyc}</dt>
              <dd className="text-xl font-bold text-amber-700">{agents.pendingKyc}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.dashboard.suspended}</dt>
              <dd className="text-xl font-bold text-red-700">{agents.suspended}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{vi.dashboard.rejected}</dt>
              <dd className="text-xl font-bold text-slate-800">{agents.rejected}</dd>
            </div>
          </dl>
        </Card>
      ) : null}
    </SectionShell>
  );
}
