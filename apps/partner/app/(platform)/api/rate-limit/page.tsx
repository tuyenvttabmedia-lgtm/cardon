'use client';

import { useEffect, useState } from 'react';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Card } from '@/components/ui/Card';
import { securityApi, ApiClientError } from '@/services/api-client';
import type { AgentSecurityRateLimit } from '@/types/platform';
import { formatDateTime } from '@/lib/utils';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </Card>
  );
}

export default function RateLimitPage() {
  const [data, setData] = useState<AgentSecurityRateLimit | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void securityApi
      .getRateLimit()
      .then(setData)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : 'Lỗi'));
  }, []);

  return (
    <ApiPageShell title="Rate Limit" description="Giới hạn tốc độ API theo gói và mức sử dụng hiện tại.">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <>
          <p className="text-sm text-slate-600">
            Gói: <strong>{data.plan}</strong> — reset phút: {formatDateTime(new Date(data.resetAt).toISOString())}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Giới hạn / phút" value={data.requestsPerMinute} />
            <Stat label="Đã dùng (phút)" value={data.currentMinute} />
            <Stat label="Còn lại (phút)" value={data.remainingMinute} />
            <Stat label="Burst" value={data.burst} />
            <Stat label="Giới hạn / ngày" value={data.requestsPerDay} />
            <Stat label="Đã dùng (ngày)" value={data.currentDay} />
            <Stat label="Còn lại (ngày)" value={data.remainingDay} />
          </div>
          {data.history429.length > 0 && (
            <Card>
              <p className="font-medium">Lịch sử 429</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {data.history429.map((h, i) => (
                  <li key={i}>
                    {formatDateTime(h.at)} — {h.count} req
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </ApiPageShell>
  );
}
