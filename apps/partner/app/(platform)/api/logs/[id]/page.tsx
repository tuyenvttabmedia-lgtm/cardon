'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiPageShell } from '@/components/api/ApiSubNav';
import { Card } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/utils';
import { apiOpsApi, ApiClientError } from '@/services/api-client';
import type { AgentApiLogDetail } from '@/types/platform';

export default function ApiLogDetailPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AgentApiLogDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiOpsApi.getLog(params.id));
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Không tải được chi tiết');
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error || !data) {
    return (
      <ApiPageShell title="Chi tiết nhật ký API">
        <p className="text-sm text-red-600">{error ?? 'Đang tải…'}</p>
        <Link href="/api/logs" className="text-indigo-600 hover:underline">
          ← Quay lại
        </Link>
      </ApiPageShell>
    );
  }

  return (
    <ApiPageShell title="Chi tiết nhật ký API" description={`${data.method} ${data.path}`}>
      <Link href="/api/logs" className="text-sm text-indigo-600 hover:underline">
        ← Nhật ký API
      </Link>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2 p-4 text-sm">
          <p className="font-semibold">Tổng quan</p>
          <p>Thời gian: {formatDateTime(data.at)}</p>
          <p>HTTP: {data.httpStatus}</p>
          <p>Latency: {data.latencyMs != null ? `${data.latencyMs}ms` : '—'}</p>
          <p>Request ID: {data.requestId ?? '—'}</p>
          <p>Partner Order: {data.partnerOrderId ?? '—'}</p>
          <p>IP: {data.ip ?? '—'}</p>
          {data.errorCode && <p className="text-red-600">Lỗi: {data.errorCode}</p>}
        </Card>

        <Card className="space-y-2 p-4">
          <p className="font-semibold">Timeline</p>
          <ul className="space-y-1 text-sm">
            {data.timeline.map((t, i) => (
              <li key={i} className="border-l-2 border-indigo-200 pl-2 dark:border-indigo-800">
                {formatDateTime(t.at)} — {t.step}: {t.detail}
              </li>
            ))}
          </ul>
        </Card>

        <Card className="space-y-2 p-4 lg:col-span-2">
          <p className="font-semibold">Headers</p>
          <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(data.requestHeaders, null, 2)}
          </pre>
          <p className="font-semibold">Request (đã che)</p>
          <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(data.requestBody, null, 2)}
          </pre>
          <p className="font-semibold">Response (đã che)</p>
          <pre className="max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(data.responseBody, null, 2)}
          </pre>
        </Card>
      </div>
    </ApiPageShell>
  );
}
