'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { CopyIdButton } from '@/components/esim-ops/CopyIdButton';
import { EsimOpsShell } from '@/components/esim-ops/EsimOpsShell';
import { formatEsimMoney, gatewayLabel, paymentTone } from '@/components/esim-ops/esim-ops-ui';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';

type PaymentRow = Awaited<ReturnType<typeof adminApi.listEsimOpsPayments>>['items'][number];

export default function EsimPaymentsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">{vi.app.loading}</p>}>
      <EsimPaymentsPageInner />
    </Suspense>
  );
}

function EsimPaymentsPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState(initialQ);
  const [gateway, setGateway] = useState('');
  const [currency, setCurrency] = useState('');
  const [status, setStatus] = useState('');
  const [preset, setPreset] = useState('7d');
  const [page, setPage] = useState(1);
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
      const data = await adminApi.listEsimOpsPayments({
        q: q.trim() || undefined,
        gateway: gateway || undefined,
        currency: currency || undefined,
        status: status || undefined,
        preset,
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
  }, [q, gateway, currency, status, preset, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <RequirePermission permission="orders.read">
      <EsimOpsShell>
        <PageHeader
          title="Thanh toán eSIM"
          subtitle="Theo dõi payment của đơn eSIM. Liên kết trực tiếp về chi tiết đơn."
          breadcrumbs={[{ label: 'Đơn hàng eSIM', href: '/esim-ops' }, { label: 'Thanh toán' }]}
          actions={
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? 'Đang tải…' : 'Làm mới'}
            </Button>
          }
        />
        {error && <ErrorMessage message={error} />}
        {notice && !error && <p className="text-xs text-slate-500">{notice}</p>}
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input
              placeholder="Payment reference hoặc mã đơn"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  void load();
                }
              }}
            />
            <Select value={gateway} onChange={(event) => { setPage(1); setGateway(event.target.value); }}>
              <option value="">Mọi cổng</option>
              <option value="PAYPAL">PayPal</option>
              <option value="SEPAY">Chuyển khoản (Viet QR)</option>
            </Select>
            <Select value={currency} onChange={(event) => { setPage(1); setCurrency(event.target.value); }}>
              <option value="">Mọi currency</option>
              <option value="VND">VND</option>
              <option value="USD">USD</option>
            </Select>
            <Select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="">Mọi trạng thái</option>
              <option value="PENDING">PENDING</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILED">FAILED</option>
              <option value="EXPIRED">EXPIRED</option>
            </Select>
            <Select value={preset} onChange={(event) => { setPage(1); setPreset(event.target.value); }}>
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
            </Select>
          </div>
          <Button size="sm" onClick={() => { setPage(1); void load(); }}>Lọc</Button>

          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Reference</TH>
                  <TH>Đơn</TH>
                  <TH>Cổng</TH>
                  <TH align="right">Số tiền</TH>
                  <TH>Trạng thái</TH>
                  <TH>Tạo / thanh toán</TH>
                </TR>
              </THead>
              <TBody>
                {loading && items.length === 0 ? (
                  <TableSkeleton colSpan={6} />
                ) : items.length === 0 ? (
                  <TableEmpty colSpan={6} message="Không có payment eSIM khớp bộ lọc." />
                ) : (
                  items.map((row) => (
                    <TR key={row.id} className="hover:bg-slate-50/80">
                      <TD>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs">{row.paymentReference}</span>
                          <CopyIdButton value={row.paymentReference} />
                        </div>
                      </TD>
                      <TD>
                        <Link href={`/esim-ops/${row.orderId}`} className="font-medium text-admin-700 hover:underline">
                          {row.orderCode}
                        </Link>
                        <p className="text-xs text-slate-500">{row.esimMarket ?? '—'}</p>
                      </TD>
                      <TD>{gatewayLabel(row.gateway)}</TD>
                      <TD align="right">{formatEsimMoney(row.amount, row.currency)}</TD>
                      <TD><Badge tone={paymentTone(row.status)} status={row.status} /></TD>
                      <TD className="text-xs text-slate-600">
                        <p>{formatDateTime(row.createdAt)}</p>
                        <p>{row.paidAt ? formatDateTime(row.paidAt) : 'Chưa thanh toán'}</p>
                      </TD>
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
              <p className="text-sm text-slate-500">Không có payment eSIM khớp bộ lọc.</p>
            ) : (
              items.map((row) => (
                <Link
                  key={row.id}
                  href={`/esim-ops/${row.orderId}`}
                  className="block rounded-xl border border-slate-200 p-3"
                >
                  <p className="font-mono text-xs font-semibold">{row.paymentReference}</p>
                  <p className="mt-1 text-sm text-admin-700">{row.orderCode}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={paymentTone(row.status)} status={row.status} />
                    <span className="text-sm font-medium">{formatEsimMoney(row.amount, row.currency)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{gatewayLabel(row.gateway)} · {formatDateTime(row.createdAt)}</p>
                </Link>
              ))
            )}
          </div>

          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>{total} payment</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</Button>
              <span>{page}/{pageCount}</span>
              <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Sau</Button>
            </div>
          </div>
        </Card>
      </EsimOpsShell>
    </RequirePermission>
  );
}
