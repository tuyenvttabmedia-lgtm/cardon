'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { EsimOpsShell } from '@/components/esim-ops/EsimOpsShell';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';

type AttemptRow = Awaited<ReturnType<typeof adminApi.listEsimOpsAttempts>>['items'][number];

export default function EsimAttemptsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">{vi.app.loading}</p>}>
      <EsimAttemptsPageInner />
    </Suspense>
  );
}

function EsimAttemptsPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [items, setItems] = useState<AttemptRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(initialQ);
  const [outcome, setOutcome] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const take = 20;

  useEffect(() => {
    const next = searchParams.get('q') ?? '';
    setQ(next);
    setPage(1);
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminApi.listEsimOpsAttempts({
        q: q.trim() || undefined,
        outcome: outcome || undefined,
        provider: provider.trim() || undefined,
        skip: (page - 1) * take,
        take,
      });
      setItems(data.items);
      setTotal(data.page.total);
      setNotice(`Đã tải lại lúc ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [q, outcome, provider, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / take));
  const open = items.find((row) => row.id === openId) ?? null;

  return (
    <RequirePermission permission="orders.read">
      <EsimOpsShell>
        <PageHeader
          title="Nhật ký cấp eSIM"
          subtitle="Lần gọi nhà cung cấp. Metadata đã được lọc secret."
          breadcrumbs={[{ label: 'Đơn hàng eSIM', href: '/esim-ops' }, { label: 'Nhật ký cấp' }]}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? 'Đang tải…' : 'Làm mới'}
            </Button>
          }
        />
        {error && <ErrorMessage message={error} />}
        {notice && !error && <p className="text-xs text-slate-500">{notice}</p>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Mã đơn"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  void load();
                }
              }}
            />
            <Input placeholder="Mã nhà cung cấp, ví dụ AIRALO" value={provider} onChange={(event) => setProvider(event.target.value)} />
            <Select value={outcome} onChange={(event) => { setPage(1); setOutcome(event.target.value); }}>
              <option value="">Mọi kết quả</option>
              <option value="SENT">SENT</option>
              <option value="UNCONFIRMED">UNCONFIRMED</option>
              <option value="CONFIRMED_CREATED">CONFIRMED_CREATED</option>
              <option value="CONFIRMED_NOT_CREATED">CONFIRMED_NOT_CREATED</option>
              <option value="REJECTED_DEFINITIVE">REJECTED_DEFINITIVE</option>
              <option value="PROFILE_SAVED">PROFILE_SAVED</option>
            </Select>
            <Button size="sm" onClick={() => { setPage(1); void load(); }}>Lọc</Button>
          </div>

          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Đơn</TH>
                  <TH>Nhà cung cấp</TH>
                  <TH>Thao tác</TH>
                  <TH>Kết quả</TH>
                  <TH>Lỗi</TH>
                  <TH>Thời điểm</TH>
                </TR>
              </THead>
              <TBody>
                {loading && items.length === 0 ? (
                  <TableSkeleton colSpan={6} />
                ) : items.length === 0 ? (
                  <TableEmpty colSpan={6} message="Chưa có lần gọi nhà cung cấp khớp bộ lọc." />
                ) : (
                  items.map((row) => (
                    <TR key={row.id} className="hover:bg-slate-50/80">
                      <TD>
                        <Link href={`/esim-ops/${row.orderId}`} className="font-mono text-xs font-semibold text-admin-700 hover:underline">
                          {row.orderCode}
                        </Link>
                        <p className="text-xs text-slate-500">{row.fulfillmentStatus}</p>
                      </TD>
                      <TD>
                        <p>{row.providerName}</p>
                        <p className="font-mono text-xs text-slate-500">{row.providerProductCode}</p>
                      </TD>
                      <TD>{row.operation}</TD>
                      <TD>
                        <button type="button" className="text-left" onClick={() => setOpenId(row.id)}>
                          <Badge tone={statusTone(row.outcome)} status={row.outcome} />
                        </button>
                      </TD>
                      <TD className="max-w-xs truncate text-xs text-amber-800">{row.errorMessage ?? row.errorCode ?? '—'}</TD>
                      <TD className="text-xs">{formatDateTime(row.createdAt)}</TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {loading && items.length === 0 ? (
              <p className="text-sm text-slate-500">Đang tải…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có lần gọi nhà cung cấp khớp bộ lọc.</p>
            ) : (
              items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="block w-full rounded-xl border border-slate-200 p-3 text-left"
                >
                  <Link
                    href={`/esim-ops/${row.orderId}`}
                    className="font-mono text-xs font-semibold text-admin-700"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {row.orderCode}
                  </Link>
                  <p className="mt-1 text-sm">{row.operation} · {row.providerName}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={statusTone(row.outcome)} status={row.outcome} />
                    <span className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</span>
                  </div>
                  {(row.errorMessage || row.errorCode) ? (
                    <p className="mt-1 truncate text-xs text-amber-800">{row.errorMessage ?? row.errorCode}</p>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{total} lần gọi</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
              <span>{page}/{pageCount}</span>
              <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Sau</Button>
            </div>
          </div>
        </Card>
        {open && (
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                {open.orderCode} · {open.operation} · {open.outcome}
              </h2>
              <Link href={`/esim-ops/${open.orderId}`} className="text-sm text-admin-700 hover:underline">
                Mở chi tiết đơn
              </Link>
            </div>
            <p className="text-sm text-slate-600">{open.errorMessage ?? 'Không có thông báo lỗi.'}</p>
            <pre className="overflow-auto rounded bg-slate-50 p-3 text-xs">{JSON.stringify({ request: open.requestMeta, response: open.responseMeta }, null, 2)}</pre>
          </Card>
        )}
      </EsimOpsShell>
    </RequirePermission>
  );
}
