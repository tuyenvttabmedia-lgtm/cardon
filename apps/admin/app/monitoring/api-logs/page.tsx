'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RequirePermission } from '@/components/layout/AdminShell';
import {
  MonitoringEmptyState,
  MonitoringFilterBar,
  MonitoringSectionHeader,
} from '@/components/monitoring/MonitoringUi';
import { Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input } from '@/components/ui/Form';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
import { partnerApiLogsApi, ApiClientError } from '@/services/api-client';
import type { PartnerApiLogDetail, PartnerApiLogEntry } from '@/services/api-client';

function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<PartnerApiLogDetail | null>(null);
  const [tab, setTab] = useState<'summary' | 'headers' | 'request' | 'response'>('summary');

  useEffect(() => {
    void partnerApiLogsApi.getById(id).then(setDetail).catch(() => setDetail(null));
  }, [id]);

  const tabs = [
    { id: 'summary' as const, label: vi.partnerApiLogs.detail },
    { id: 'headers' as const, label: vi.partnerApiLogs.headers },
    { id: 'request' as const, label: vi.partnerApiLogs.request },
    { id: 'response' as const, label: vi.partnerApiLogs.response },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-lg font-semibold">{vi.partnerApiLogs.detail}</h3>
          <Button type="button" variant="secondary" onClick={onClose}>
            {vi.app.cancel}
          </Button>
        </div>
        {!detail ? (
          <p className="p-4 text-sm text-zinc-500">{vi.app.loading}</p>
        ) : (
          <>
            <div className="flex gap-2 border-b px-4 py-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    'rounded px-3 py-1 text-sm',
                    tab === t.id ? 'bg-admin-100 font-medium text-admin-800' : 'text-zinc-600',
                  )}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm">
              {tab === 'summary' && (
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.time}</dt><dd>{formatDateTime(detail.at)}</dd></div>
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.method}</dt><dd>{detail.method}</dd></div>
                  <div className="col-span-2"><dt className="text-zinc-500">{vi.partnerApiLogs.endpoint}</dt><dd className="font-mono text-xs">{detail.path}</dd></div>
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.httpStatus}</dt><dd>{detail.httpStatus}</dd></div>
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.latency}</dt><dd>{detail.latencyMs != null ? `${detail.latencyMs} ms` : '—'}</dd></div>
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.ip}</dt><dd>{detail.ip ?? '—'}</dd></div>
                  <div><dt className="text-zinc-500">{vi.partnerApiLogs.type}</dt><dd>{detail.type}</dd></div>
                  <div className="col-span-2"><dt className="text-zinc-500">{vi.monitoringHub.requestId}</dt><dd className="font-mono text-xs">{detail.requestId ?? '—'}</dd></div>
                  <div className="col-span-2"><dt className="text-zinc-500">{vi.monitoringHub.orderId}</dt><dd className="font-mono text-xs">{detail.orderId ?? '—'}</dd></div>
                </dl>
              )}
              {tab === 'headers' && (
                <pre className="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">
                  {JSON.stringify({ request: detail.requestHeaders, response: detail.responseHeaders }, null, 2)}
                </pre>
              )}
              {tab === 'request' && (
                <pre className="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">
                  {JSON.stringify(detail.requestBody, null, 2)}
                </pre>
              )}
              {tab === 'response' && (
                <pre className="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">
                  {JSON.stringify(detail.responseBody, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApiLogsPageInner() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<PartnerApiLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [agentId, setAgentId] = useState('');
  const [httpStatus, setHttpStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const q = searchParams.get('search');
    if (q) setSearch(q);
    const id = searchParams.get('id');
    if (id) setSelectedId(id);
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await partnerApiLogsApi.list({
        page,
        limit: 20,
        search: search.trim() || undefined,
        agentId: agentId.trim() || undefined,
        httpStatus: httpStatus.trim() || undefined,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : vi.partnerApiLogs.loadError);
    } finally {
      setLoading(false);
    }
  }, [page, search, agentId, httpStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <RequirePermission permission="webhook.read">
      <div className="space-y-4">
        <MonitoringSectionHeader
          title={vi.partnerApiLogs.title}
          subtitle={vi.partnerApiLogs.subtitle}
        />

        {error && <ErrorMessage message={error} />}

        <MonitoringFilterBar>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[200px] flex-1"
              placeholder={vi.partnerApiLogs.search}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Input
              className="w-48 font-mono text-sm"
              placeholder={vi.partnerApiLogs.agentId}
              value={agentId}
              onChange={(e) => { setAgentId(e.target.value); setPage(1); }}
            />
            <Input
              className="w-24"
              placeholder={vi.partnerApiLogs.httpStatus}
              value={httpStatus}
              onChange={(e) => { setHttpStatus(e.target.value); setPage(1); }}
            />
            <Button type="button" variant="secondary" onClick={() => void load()}>
              {vi.app.search}
            </Button>
          </div>
        </MonitoringFilterBar>

        {loading ? (
          <MonitoringEmptyState message={vi.app.loading} />
        ) : !items.length ? (
          <MonitoringEmptyState message={vi.common.noData} />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="min-w-full text-sm">
              <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">{vi.partnerApiLogs.time}</th>
                  <th className="px-3 py-2">{vi.monitoringHub.requestId}</th>
                  <th className="px-3 py-2">{vi.partnerApiLogs.endpoint}</th>
                  <th className="px-3 py-2">{vi.partnerApiLogs.httpStatus}</th>
                  <th className="px-3 py-2">{vi.partnerApiLogs.latency}</th>
                  <th className="px-3 py-2">{vi.partnerApiLogs.ip}</th>
                  <th className="px-3 py-2">{vi.partnerApiLogs.type}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-100">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.at)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.requestId ?? '—'}</td>
                    <td className="max-w-[180px] truncate px-3 py-2 font-mono text-xs">{row.method} {row.path}</td>
                    <td className="px-3 py-2">{row.httpStatus}</td>
                    <td className="px-3 py-2">{row.latencyMs != null ? `${row.latencyMs}ms` : '—'}</td>
                    <td className="px-3 py-2">{row.ip ?? '—'}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2">
                      <button type="button" className="text-admin-600 hover:underline" onClick={() => setSelectedId(row.id)}>
                        {vi.partnerApiLogs.detail}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {!loading && total > 20 && (
          <div className="flex items-center justify-between text-sm text-zinc-500">
            <span>{vi.common.page} {page} · {total} {vi.monitoringHub.records}</span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                {vi.common.prev}
              </Button>
              <Button type="button" variant="secondary" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>
                {vi.common.next}
              </Button>
            </div>
          </div>
        )}

        {selectedId && <DetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />}
      </div>
    </RequirePermission>
  );
}

export default function ApiLogsPage() {
  return (
    <Suspense fallback={<MonitoringEmptyState message={vi.app.loading} />}>
      <ApiLogsPageInner />
    </Suspense>
  );
}
