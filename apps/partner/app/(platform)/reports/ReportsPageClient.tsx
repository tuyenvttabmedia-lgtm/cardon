'use client';

import { useEffect, useState } from 'react';
import { Card, StatCard } from '@/components/ui/Card';
import { PlatformSection } from '@/components/platform/PlatformSection';
import { agentPlatformApi, orderOperationsApi } from '@/services/api-client';

export default function ReportsPageClient() {
  const [reports, setReports] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof orderOperationsApi.getStatistics>> | null>(null);

  useEffect(() => {
    void agentPlatformApi.getReports().then(setReports).catch(() => setReports(null));
    void orderOperationsApi.getStatistics().then(setStats).catch(() => setStats(null));
  }, []);

  const apiUsage = reports?.apiUsage as { today?: number } | undefined;
  const orders = reports?.orders as { today?: number } | undefined;

  return (
    <PlatformSection
      title="Báo cáo API"
      description="Thống kê gọi API, đơn hàng, tỷ lệ thành công/thất bại và webhook."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Gọi API (hôm nay)" value={String(apiUsage?.today ?? stats?.cards.totalToday ?? 0)} />
        <StatCard label="Đơn API (hôm nay)" value={String(orders?.today ?? stats?.cards.totalToday ?? 0)} />
        <StatCard label="Thành công" value={String(stats?.cards.successToday ?? 0)} />
        <StatCard label="Thất bại" value={String(stats?.cards.failedToday ?? 0)} />
        <StatCard label="Đang xử lý" value={String(stats?.cards.processingToday ?? 0)} />
        <StatCard label="Latency TB" value={stats?.cards.avgLatencyMs ? `${stats.cards.avgLatencyMs} ms` : '—'} />
      </div>
      <Card>
        <p className="text-sm font-semibold text-slate-900">Gateway & Provider</p>
        <p className="mt-2 text-sm text-slate-500">
          Báo cáo chi tiết theo gateway và provider sẽ bổ sung trong mốc analytics tiếp theo.
        </p>
      </Card>
    </PlatformSection>
  );
}
