'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type {
  EsimOpsDashboard,
  EsimOpsHealth,
  EsimOpsListItem,
  EsimOpsListResponse,
  EsimOpsMoneyBucket,
} from '@/types/api';

const PAYMENT_OPTIONS = [
  { value: '', label: 'Mọi thanh toán' },
  { value: 'PAID', label: 'Đã thanh toán' },
  { value: 'WAITING_PAYMENT', label: 'Chờ thanh toán' },
  { value: 'EXPIRED', label: 'Hết hạn' },
  { value: 'REFUNDED', label: 'Đã hoàn' },
];

const PAGE_SIZES = [10, 20, 50];

const FULFILL_OPTIONS = [
  { value: '', label: 'Mọi giao eSIM' },
  { value: 'NEED_MANUAL_REVIEW', label: 'Cần gọi lại Airalo' },
  { value: 'WAITING_ADMIN_RETRY', label: 'Chờ admin retry' },
  { value: 'FAILED', label: 'Lỗi giao' },
  { value: 'PENDING', label: 'Chưa giao' },
  { value: 'PROCESSING', label: 'Đang gọi Airalo' },
  { value: 'COMPLETED', label: 'Đã có mã cài' },
];

function laneLabel(item: EsimOpsListItem): string {
  if (item.lane === 'sandbox') return 'Sandbox / test';
  if (item.profilePresent) return 'Đã có mã cài';
  if (item.paidUnfulfilled || (item.paymentStatus === 'PAID' && !item.profilePresent)) {
    return 'Đã thu tiền, chưa cấp eSIM';
  }
  if (item.paymentStatus !== 'PAID') return 'Chờ thanh toán';
  if (item.airaloOrderId) return 'Airalo đã nhận, chưa có LPA';
  return 'Chưa gọi Airalo';
}

function laneTone(item: EsimOpsListItem): 'success' | 'warning' | 'danger' | 'neutral' {
  if (item.lane === 'sandbox') return 'neutral';
  if (item.profilePresent) return 'success';
  if (item.paymentStatus === 'PAID') return 'warning';
  return 'neutral';
}

function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }
  return formatVnd(amount);
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—';
  return `${(rate * 100).toFixed(1)}%`;
}

export default function EsimOpsListPage() {
  const [data, setData] = useState<EsimOpsListResponse | null>(null);
  const [dashboard, setDashboard] = useState<EsimOpsDashboard | null>(null);
  const [health, setHealth] = useState<EsimOpsHealth | null>(null);
  const [q, setQ] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [fulfillmentStatus, setFulfillmentStatus] = useState('');
  const [preset, setPreset] = useState('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [lane, setLane] = useState('');
  const [paidUnfulfilled, setPaidUnfulfilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const dateParams =
    preset === 'custom' && (from || to)
      ? { from: from || undefined, to: to || undefined }
      : { preset: preset === 'custom' ? '7d' : preset };

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const [list, board, airalo] = await Promise.all([
        adminApi.listEsimOps({
          q: q.trim() || undefined,
          paymentStatus: paymentStatus || undefined,
          fulfillmentStatus: fulfillmentStatus || undefined,
          ...dateParams,
          lane: lane || undefined,
          paidUnfulfilled: paidUnfulfilled || undefined,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        adminApi.getEsimOpsDashboard(dateParams),
        adminApi.getEsimOpsHealth(),
      ]);
      setData(list);
      setDashboard(board);
      setHealth(airalo);
      setNotice(`Đã tải lại lúc ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    } finally {
      setLoading(false);
    }
  }, [q, paymentStatus, fulfillmentStatus, preset, from, to, lane, paidUnfulfilled, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyList(next: {
    paymentStatus?: string;
    fulfillmentStatus?: string;
    lane?: string;
    paidUnfulfilled?: boolean;
  }) {
    setPage(1);
    setPaymentStatus(next.paymentStatus ?? '');
    setFulfillmentStatus(next.fulfillmentStatus ?? '');
    setLane(next.lane ?? '');
    setPaidUnfulfilled(next.paidUnfulfilled ?? false);
  }

  const orders = dashboard?.orders;
  const airaloOk = Boolean(health?.configured && health.hostResolves && !health.retiredSandboxHost);

  return (
    <RequirePermission permission="orders.read">
      <div className="space-y-5">
        <PageHeader
          title="Đơn hàng eSIM"
          subtitle="KPI, báo cáo và xử lý đơn eSIM. Đối soát cổng/sổ cái dùng Operations Center, không nhân bản tại đây."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {health && (
                <Link
                  href="/configuration/airalo"
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                >
                  <Badge tone={airaloOk ? 'success' : 'warning'}>
                    {airaloOk ? 'Airalo sẵn sàng' : 'Airalo cần kiểm tra'}
                  </Badge>
                </Link>
              )}
              <Link href="/operations" className="text-sm text-admin-700 hover:underline">
                Operations Center
              </Link>
              <Button variant="secondary" onClick={() => void load()} disabled={loading}>
                {loading ? 'Đang tải…' : 'Làm mới'}
              </Button>
            </div>
          }
        />

        {error && <ErrorMessage message={error} />}
        {notice && !error && <p className="text-xs text-slate-500">{notice}</p>}

        {!airaloOk && health && (
          <Card className="space-y-1 border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Airalo chưa gọi được</p>
            <p className="font-mono text-xs">{health.baseUrl}</p>
            <p>{health.note}</p>
            <Link href="/configuration/airalo" className="text-admin-700 hover:underline">
              Mở cấu hình Airalo
            </Link>
          </Card>
        )}

        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <p className="text-xs text-slate-500">Khoảng ngày (VN +07)</p>
            <Select
              value={preset}
              onChange={(event) => {
                setPage(1);
                setPreset(event.target.value);
              }}
            >
              <option value="today">Hôm nay</option>
              <option value="7d">7 ngày</option>
              <option value="30d">30 ngày</option>
              <option value="custom">Tùy chọn</option>
            </Select>
          </div>
          {preset === 'custom' && (
            <>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Từ</span>
                <Input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-slate-500">Đến</span>
                <Input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
              </label>
            </>
          )}
          {dashboard && (
            <p className="text-xs text-slate-500">
              Đơn theo createdAt; doanh thu theo payment SUCCESS (paidAt) · {dashboard.range.preset}
            </p>
          )}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Tổng đơn eSIM" value={orders?.total ?? 0} onClick={() => applyList({})} />
          <Kpi label="Thương mại" value={orders?.commerce ?? 0} onClick={() => applyList({ lane: 'commerce' })} />
          <Kpi label="Sandbox / test" value={orders?.sandbox ?? 0} onClick={() => applyList({ lane: 'sandbox' })} />
          <Kpi
            label="Chưa thanh toán"
            value={orders?.unpaid ?? 0}
            onClick={() => applyList({ paymentStatus: 'WAITING_PAYMENT' })}
          />
          <Kpi
            label="Đã thu, chưa cấp eSIM"
            value={orders?.paidUnfulfilled ?? 0}
            warn
            onClick={() => applyList({ paidUnfulfilled: true })}
          />
          <Kpi
            label="Đã có mã cài"
            value={orders?.completed ?? 0}
            ok
            onClick={() => applyList({ paymentStatus: 'PAID', fulfillmentStatus: 'COMPLETED' })}
          />
          <Kpi
            label="Đang xử lý"
            value={orders?.processing ?? 0}
            onClick={() => applyList({ fulfillmentStatus: 'PROCESSING' })}
          />
          <Kpi
            label="Cần gọi lại Airalo"
            value={orders?.needManualReview ?? 0}
            warn
            onClick={() => applyList({ fulfillmentStatus: 'NEED_MANUAL_REVIEW' })}
          />
          <Kpi
            label="Chờ admin retry"
            value={orders?.waitingAdminRetry ?? 0}
            warn
            onClick={() => applyList({ fulfillmentStatus: 'WAITING_ADMIN_RETRY' })}
          />
          <Kpi
            label="Lỗi giao"
            value={orders?.failed ?? 0}
            warn
            onClick={() => applyList({ fulfillmentStatus: 'FAILED' })}
          />
          <Card className="p-4">
            <p className="text-xs text-slate-500">Tỷ lệ cấp eSIM (commerce PAID)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatRate(dashboard?.installSuccessRate.rate ?? null)}
            </p>
            <p className="text-xs text-slate-500">
              {dashboard ? `${dashboard.installSuccessRate.numerator}/${dashboard.installSuccessRate.denominator}` : '—'}
            </p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <MoneyTable
            title="Doanh thu thương mại (payment SUCCESS)"
            rows={dashboard?.revenue.commerce ?? []}
            empty="Chưa có payment SUCCESS thương mại trong khoảng."
          />
          <MoneyTable
            title="Doanh thu sandbox / test — không cộng vào thương mại"
            rows={dashboard?.revenue.sandbox ?? []}
            empty="Không có payment SUCCESS sandbox trong khoảng."
          />
        </div>

        {dashboard && (
          <Card className="space-y-2 p-4 text-sm text-slate-600">
            <p>{dashboard.checkoutCostSnapshot.reason}</p>
            <p>{dashboard.definitions.revenue}</p>
            <p>{dashboard.definitions.installSuccessRate}</p>
          </Card>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Gói bán chạy (commerce, theo số đơn PAID)</h2>
            <SimpleTable
              headers={['Gói', 'ISO', 'Đơn', 'PAID']}
              rows={(dashboard?.topPackages ?? []).map((row) => [
                row.title,
                row.countryIso,
                String(row.orders),
                String(row.commercePaid),
              ])}
              empty="Chưa có đơn commerce trong khoảng."
            />
          </Card>
          <Card className="space-y-3 p-4">
            <h2 className="font-semibold">Theo quốc gia (commerce)</h2>
            <SimpleTable
              headers={['ISO', 'Đơn', 'PAID']}
              rows={(dashboard?.countries ?? []).map((row) => [
                row.countryIso,
                String(row.orders),
                String(row.commercePaid),
              ])}
              empty="Chưa có đơn commerce trong khoảng."
            />
          </Card>
        </div>

        <Card className="space-y-4 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_11rem_13rem_10rem_auto]">
            <Input
              placeholder="Mã đơn CardOn, email, SĐT…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  void load();
                }
              }}
            />
            <Select
              value={paymentStatus}
              onChange={(event) => {
                setPage(1);
                setPaidUnfulfilled(false);
                setPaymentStatus(event.target.value);
              }}
            >
              {PAYMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={fulfillmentStatus}
              onChange={(event) => {
                setPage(1);
                setFulfillmentStatus(event.target.value);
              }}
            >
              {FULFILL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              value={lane}
              onChange={(event) => {
                setPage(1);
                setLane(event.target.value);
              }}
            >
              <option value="">Mọi lane</option>
              <option value="commerce">Thương mại</option>
              <option value="sandbox">Sandbox / test</option>
            </Select>
            <Button onClick={() => { setPage(1); void load(); }}>Lọc</Button>
          </div>
          {paidUnfulfilled && (
            <p className="text-sm text-amber-800">Đang lọc đơn đã thu tiền nhưng chưa cấp được eSIM.</p>
          )}

          <Table>
            <THead>
              <TR>
                <TH>Mã đơn</TH>
                <TH>Khách</TH>
                <TH>Gói / package_id</TH>
                <TH>Airalo code</TH>
                <TH align="right">Khách trả</TH>
                <TH>Trạng thái</TH>
                <TH>Thời gian</TH>
              </TR>
            </THead>
            <TBody>
              {loading && !data ? (
                <TableSkeleton colSpan={7} />
              ) : !data || data.items.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  message="Chưa có đơn eSIM khớp bộ lọc. Đơn eSIM bán lẻ phải có variant type ESIM — không nằm ở menu Đơn hàng thẻ/nạp."
                />
              ) : (
                data.items.map((item) => (
                  <TR key={item.id}>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      <Link href={`/esim-ops/${item.id}`} className="text-admin-700 hover:underline">
                        {item.orderCode}
                      </Link>
                    </TD>
                    <TD>
                      <p className="truncate">{item.customerName ?? item.customerEmail ?? '—'}</p>
                      {item.customerName && item.customerEmail && (
                        <p className="truncate text-xs text-slate-500">{item.customerEmail}</p>
                      )}
                    </TD>
                    <TD>
                      <p>{item.packageTitle ?? '—'}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {item.providerProductCode ?? '—'}
                      </p>
                    </TD>
                    <TD className="whitespace-nowrap font-mono text-xs">
                      {item.airaloOrderId ?? '—'}
                    </TD>
                    <TD align="right" className="whitespace-nowrap">
                      {formatVnd(item.customerPaid)}
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge tone={statusTone(item.paymentStatus)} status={item.paymentStatus} />
                        <Badge tone={statusTone(item.fulfillmentStatus)} status={item.fulfillmentStatus} />
                        <Badge tone={laneTone(item)}>{laneLabel(item)}</Badge>
                      </div>
                      {item.lastError && (
                        <p className="mt-1 max-w-[18rem] truncate text-xs text-amber-800" title={item.lastError}>
                          {item.lastError}
                        </p>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-slate-600">
                      {formatDateTime(item.createdAt)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
          {data?.page && (
            <Pager
              skip={data.page.skip}
              take={data.page.take}
              total={data.page.total}
              page={page}
              pageSize={pageSize}
              onPage={setPage}
              onPageSize={(size) => {
                setPage(1);
                setPageSize(size);
              }}
            />
          )}
        </Card>
      </div>
    </RequirePermission>
  );
}

function MoneyTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: EsimOpsMoneyBucket[];
  empty: string;
}) {
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tiền tệ</TH>
              <TH>Cổng</TH>
              <TH align="right">Số payment</TH>
              <TH align="right">Tổng</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={`${row.currency}-${row.gateway}`}>
                <TD>{row.currency}</TD>
                <TD>{row.gateway}</TD>
                <TD align="right">{row.payments}</TD>
                <TD align="right">{formatMoney(row.amount, row.currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <Table>
      <THead>
        <TR>
          {headers.map((header) => (
            <TH key={header}>{header}</TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {rows.map((row, index) => (
          <TR key={`${row[0]}-${index}`}>
            {row.map((cell, cellIndex) => (
              <TD key={`${cell}-${cellIndex}`}>{cell}</TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function Pager({
  skip,
  take,
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  skip: number;
  take: number;
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const start = total === 0 ? 0 : skip + 1;
  const end = Math.min(skip + take, total);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
      <p>
        Hiển thị {start}–{end} / {total} đơn
      </p>
      <div className="flex items-center gap-2">
        <Select
          className="w-auto"
          value={String(pageSize)}
          onChange={(event) => onPageSize(Number(event.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / trang
            </option>
          ))}
        </Select>
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Trước
        </Button>
        <span>
          {page}/{pageCount}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  warn,
  ok,
  onClick,
}: {
  label: string;
  value: number;
  warn?: boolean;
  ok?: boolean;
  onClick?: () => void;
}) {
  const card = (
    <Card
      interactive={Boolean(onClick)}
      className={`p-4 ${warn ? 'border-amber-200 bg-amber-50' : ok ? 'border-emerald-200 bg-emerald-50' : ''}`}
    >
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </Card>
  );
  if (!onClick) return card;
  return (
    <button type="button" className="text-left" onClick={onClick}>
      {card}
    </button>
  );
}
