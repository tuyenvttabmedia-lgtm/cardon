'use client';

import { useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Card, StatCard } from '@/components/ui/Card';
import { apiOpsApi, securityApi } from '@/services/api-client';
import type { AgentApiUsageStats } from '@/types/platform';

export default function ApiUsagePage() {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('today');
  const [usage, setUsage] = useState<AgentApiUsageStats | null>(null);
  const [rateLimit, setRateLimit] = useState<Awaited<ReturnType<typeof securityApi.getRateLimit>> | null>(null);

  useEffect(() => {
    void apiOpsApi.getUsage(period).then(setUsage).catch(() => setUsage(null));
  }, [period]);

  useEffect(() => {
    void securityApi.getRateLimit().then(setRateLimit).catch(() => setRateLimit(null));
  }, []);

  return (
    <ApiPageShell title="Sử dụng API" description="Thống kê gọi API, latency, endpoint và lỗi phổ biến.">
      <div className="flex gap-2">
        {(['today', '7d', '30d'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${period === p ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800'}`}
          >
            {p === 'today' ? 'Hôm nay' : p === '7d' ? '7 ngày' : '30 ngày'}
          </button>
        ))}
      </div>

      {usage && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Tổng gọi API" value={String(usage.total)} />
            <StatCard label="Thành công" value={String(usage.success)} />
            <StatCard label="Thất bại" value={String(usage.failed)} />
            <StatCard label="Latency TB" value={`${usage.avgLatencyMs}ms`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <p className="font-semibold">Top Endpoint</p>
              <ul className="mt-2 space-y-1 text-sm">
                {usage.topEndpoints.map((e) => (
                  <li key={e.key} className="flex justify-between">
                    <span className="truncate font-mono text-xs">{e.key}</span>
                    <span>{e.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="p-4">
              <p className="font-semibold">Top Lỗi</p>
              <ul className="mt-2 space-y-1 text-sm">
                {usage.topErrors.length ? (
                  usage.topErrors.map((e) => (
                    <li key={e.key} className="flex justify-between">
                      <span>{e.key}</span>
                      <span>{e.count}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-slate-500">Không có lỗi</li>
                )}
              </ul>
            </Card>
            <Card className="p-4">
              <p className="font-semibold">Top Sản phẩm</p>
              <ul className="mt-2 space-y-1 text-sm">
                {usage.topProducts.map((e) => (
                  <li key={e.key} className="flex justify-between">
                    <span>{e.key}</span>
                    <span>{e.count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {rateLimit && (
        <Card className="p-4">
          <p className="font-semibold">Rate Limit</p>
          <p className="mt-2 text-sm text-slate-600">
            Phút: {rateLimit.currentMinute}/{rateLimit.requestsPerMinute} · Ngày: {rateLimit.currentDay}/
            {rateLimit.requestsPerDay}
          </p>
        </Card>
      )}
    </ApiPageShell>
  );
}
