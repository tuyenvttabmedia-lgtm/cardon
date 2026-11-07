'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CopyIdButton } from '@/components/esim-ops/CopyIdButton';
import { EsimOpsShell } from '@/components/esim-ops/EsimOpsShell';
import {
  formatEsimMoney,
  fulfillmentTone,
  listChargeLabel,
  paymentTone,
  pickCurrencyBucket,
  sumMoneyBucketsByCurrency,
} from '@/components/esim-ops/esim-ops-ui';
import { RequirePermission } from '@/components/layout/AdminShell';
import { Badge, Card, ErrorMessage } from '@/components/ui/Display';
import { Button, Input, Select } from '@/components/ui/Form';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableEmpty, TableSkeleton, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { cn, formatDateTime } from '@/lib/utils';
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
  { value: '', label: 'Mọi trạng thái giao' },
  { value: 'NEED_MANUAL_REVIEW', label: 'Cần xử lý thủ công' },
  { value: 'WAITING_ADMIN_RETRY', label: 'Chờ thử lại' },
  { value: 'FAILED', label: 'Giao thất bại' },
  { value: 'PENDING', label: 'Chưa giao' },
  { value: 'PROCESSING', label: 'Đang lấy mã cài' },
  { value: 'COMPLETED', label: 'Đã có mã cài' },
];

type QuickTab =
  | 'all'
  | 'unpaid'
  | 'paid'
  | 'processing'
  | 'completed'
  | 'attention'
  | 'paidUnfulfilled';

type ReportPanel = 'revenue' | 'packages' | 'countries' | 'economics';

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
  const [market, setMarket] = useState('');
  const [reportMarket, setReportMarket] = useState('');
  const [reportCurrency, setReportCurrency] = useState('');
  const [reportGateway, setReportGateway] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [paidUnfulfilled, setPaidUnfulfilled] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [reportPanel, setReportPanel] = useState<ReportPanel>('revenue');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const dateParams =
    preset === 'custom' && (from || to)
      ? { from: from || undefined, to: to || undefined }
      : { preset: preset === 'custom' ? '7d' : preset };
  const reportParams = {
    ...dateParams,
    market: reportMarket || undefined,
    currency: reportCurrency || undefined,
    gateway: reportGateway || undefined,
    paymentStatus: reportStatus || undefined,
  };

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
          market: market || undefined,
          paidUnfulfilled: paidUnfulfilled || undefined,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        adminApi.getEsimOpsDashboard(reportParams),
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
  }, [q, paymentStatus, fulfillmentStatus, preset, from, to, lane, market, paidUnfulfilled, page, pageSize, reportMarket, reportCurrency, reportGateway, reportStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportCsv() {
    try {
      const exported = await adminApi.exportEsimOps({
        q: q.trim() || undefined,
        paymentStatus: paymentStatus || undefined,
        fulfillmentStatus: fulfillmentStatus || undefined,
        ...dateParams,
        lane: lane || undefined,
        market: market || undefined,
        paidUnfulfilled: paidUnfulfilled || undefined,
      });
      const header = ['orderCode', 'email', 'market', 'country', 'chargeCurrency', 'chargeAmount', 'paymentStatus', 'fulfillmentStatus', 'createdAt'];
      const lines = exported.items.map((item) =>
        [item.orderCode, item.customerEmail ?? '', item.esimMarket ?? '', item.countryIso ?? '', item.chargeCurrency ?? '', item.chargeAmount ?? item.customerPaid, item.paymentStatus, item.fulfillmentStatus, item.createdAt]
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(','),
      );
      const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'esim-orders.csv';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.app.requestFailed);
    }
  }

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

  function clearFilters() {
    setQ('');
    setPage(1);
    applyList({});
    setMarket('');
    setLane('');
    setPreset('7d');
    setFrom('');
    setTo('');
  }

  const orders = dashboard?.orders;
  const airaloOk = Boolean(health?.configured && health.hostResolves && !health.retiredSandboxHost);
  const attentionCount = (orders?.needManualReview ?? 0) + (orders?.waitingAdminRetry ?? 0) + (orders?.failed ?? 0);
  const commerceByCurrency = useMemo(
    () => sumMoneyBucketsByCurrency(dashboard?.revenue.commerce ?? []),
    [dashboard?.revenue.commerce],
  );
  const sandboxByCurrency = useMemo(
    () => sumMoneyBucketsByCurrency(dashboard?.revenue.sandbox ?? []),
    [dashboard?.revenue.sandbox],
  );
  const commerceVnd = pickCurrencyBucket(commerceByCurrency, 'VND');
  const commerceUsd = pickCurrencyBucket(commerceByCurrency, 'USD');
  const sandboxHint = sandboxByCurrency.length
    ? sandboxByCurrency
        .map((row) => `${row.currency} ${formatEsimMoney(row.amount, row.currency)}`)
        .join(' · ')
    : null;

  const activeTab: QuickTab = useMemo(() => {
    if (paidUnfulfilled) return 'paidUnfulfilled';
    if (!paymentStatus && !fulfillmentStatus && !lane) return 'all';
    if (paymentStatus === 'WAITING_PAYMENT' && !fulfillmentStatus) return 'unpaid';
    if (paymentStatus === 'PAID' && fulfillmentStatus === 'COMPLETED') return 'completed';
    if (paymentStatus === 'PAID' && !fulfillmentStatus) return 'paid';
    if (fulfillmentStatus === 'PROCESSING') return 'processing';
    if (fulfillmentStatus === 'COMPLETED' && !paymentStatus) return 'completed';
    if (fulfillmentStatus === 'NEED_MANUAL_REVIEW') return 'attention';
    return 'all';
  }, [paymentStatus, fulfillmentStatus, lane, paidUnfulfilled]);

  function selectTab(tab: QuickTab) {
    setPage(1);
    if (tab === 'all') applyList({});
    else if (tab === 'unpaid') applyList({ paymentStatus: 'WAITING_PAYMENT' });
    else if (tab === 'paid') applyList({ paymentStatus: 'PAID' });
    else if (tab === 'processing') applyList({ fulfillmentStatus: 'PROCESSING' });
    else if (tab === 'completed') applyList({ paymentStatus: 'PAID', fulfillmentStatus: 'COMPLETED' });
    else if (tab === 'attention') applyList({ fulfillmentStatus: 'NEED_MANUAL_REVIEW' });
    else if (tab === 'paidUnfulfilled') applyList({ paidUnfulfilled: true });
  }

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = [];
    if (q.trim()) chips.push({ key: 'q', label: `Tìm: ${q.trim()}` });
    if (paymentStatus) chips.push({ key: 'pay', label: PAYMENT_OPTIONS.find((o) => o.value === paymentStatus)?.label ?? paymentStatus });
    if (fulfillmentStatus) chips.push({ key: 'ff', label: FULFILL_OPTIONS.find((o) => o.value === fulfillmentStatus)?.label ?? fulfillmentStatus });
    if (market) chips.push({ key: 'market', label: `Thị trường ${market}` });
    if (lane) chips.push({ key: 'lane', label: lane === 'sandbox' ? 'Đơn thử' : 'Thương mại' });
    if (paidUnfulfilled) chips.push({ key: 'puf', label: 'Đã thu, chưa cấp eSIM' });
    if (preset !== '7d') chips.push({ key: 'range', label: preset === 'today' ? 'Hôm nay' : preset === '30d' ? '30 ngày' : 'Khoảng tùy chọn' });
    return chips;
  }, [q, paymentStatus, fulfillmentStatus, market, lane, paidUnfulfilled, preset]);

  const tabs: Array<{ id: QuickTab; label: string; count?: number }> = [
    { id: 'all', label: 'Tất cả', count: orders?.total },
    { id: 'unpaid', label: 'Chờ thanh toán', count: orders?.unpaid },
    { id: 'paid', label: 'Đã thanh toán', count: orders?.paid },
    { id: 'processing', label: 'Đang fulfillment', count: orders?.processing },
    { id: 'completed', label: 'Hoàn tất', count: orders?.completed },
    { id: 'attention', label: 'Cần xử lý', count: orders?.needManualReview },
  ];

  return (
    <RequirePermission permission="orders.read">
      <EsimOpsShell>
        <PageHeader
          title="Đơn hàng eSIM"
          subtitle="Quản lý đơn hàng, thanh toán và quá trình cung cấp eSIM."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {health && (
                <Link
                  href="/configuration/airalo"
                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold"
                >
                  <Badge tone={airaloOk ? 'success' : 'warning'}>
                    {airaloOk ? 'NCC sẵn sàng' : 'NCC cần kiểm tra'}
                  </Badge>
                </Link>
              )}
              <Link
                href="/finance/esim"
                className="inline-flex items-center rounded-full border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:border-admin-300 hover:text-admin-700"
              >
                Tài chính eSIM
              </Link>
              <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
                Xuất CSV
              </Button>
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? 'Đang tải…' : 'Làm mới'}
              </Button>
            </div>
          }
        />

        {error && <ErrorMessage message={error} />}
        {notice && !error && <p className="text-xs text-slate-500">{notice}</p>}

        {!airaloOk && health && (
          <Card className="space-y-1 border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-semibold">Nhà cung cấp eSIM chưa gọi được</p>
            <p className="font-mono text-xs">{health.baseUrl}</p>
            <p>{health.note}</p>
            <Link href="/configuration/airalo" className="text-admin-700 hover:underline">
              Mở cấu hình nhà cung cấp
            </Link>
          </Card>
        )}

        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Doanh thu thương mại</p>
              <p className="text-[11px] text-slate-400">Payment SUCCESS · không cộng VND với USD · sandbox tách riêng</p>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-admin-700 hover:underline"
              onClick={() => setReportPanel('revenue')}
            >
              Chi tiết theo cổng ↓
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <RevenueKpi
              label="Doanh thu VND"
              amount={commerceVnd ? formatEsimMoney(commerceVnd.amount, 'VND') : '₫0'}
              hint={commerceVnd ? `${commerceVnd.payments} payment SUCCESS` : 'Chưa có payment SUCCESS VND'}
            />
            <RevenueKpi
              label="Doanh thu USD"
              amount={commerceUsd ? formatEsimMoney(commerceUsd.amount, 'USD') : '$0.00'}
              hint={commerceUsd ? `${commerceUsd.payments} payment SUCCESS` : 'Chưa có payment SUCCESS USD'}
            />
            <Kpi label="Đã thanh toán" value={orders?.paid ?? 0} active={activeTab === 'paid'} onClick={() => selectTab('paid')} />
            <Kpi
              label="Cần xử lý / thất bại"
              value={attentionCount}
              warn
              active={activeTab === 'attention' || activeTab === 'paidUnfulfilled'}
              onClick={() => selectTab('attention')}
              hint={orders ? `Review ${orders.needManualReview} · Retry ${orders.waitingAdminRetry} · Fail ${orders.failed}` : undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            <Kpi label="Tổng đơn" value={orders?.total ?? 0} active={activeTab === 'all'} onClick={() => selectTab('all')} />
            <Kpi label="Chờ thanh toán" value={orders?.unpaid ?? 0} active={activeTab === 'unpaid'} onClick={() => selectTab('unpaid')} />
            <Kpi label="Đang xử lý" value={orders?.processing ?? 0} active={activeTab === 'processing'} onClick={() => selectTab('processing')} />
            <Kpi label="Hoàn tất" value={orders?.completed ?? 0} ok active={activeTab === 'completed'} onClick={() => selectTab('completed')} />
          </div>
          {sandboxHint ? (
            <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Sandbox / đơn thử (không cộng thương mại): {sandboxHint}
            </p>
          ) : null}
          {(orders?.paidUnfulfilled ?? 0) > 0 ? (
            <button
              type="button"
              onClick={() => selectTab('paidUnfulfilled')}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-left text-sm',
                activeTab === 'paidUnfulfilled'
                  ? 'border-amber-300 bg-amber-50 text-amber-950'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-200',
              )}
            >
              Đã thu, chưa cấp eSIM: <strong>{orders?.paidUnfulfilled ?? 0}</strong>
            </button>
          ) : null}
        </Card>

        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1">
            {tabs.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => selectTab(tab.id)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                    selected ? 'bg-admin-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50',
                  )}
                >
                  {tab.label}
                  {typeof tab.count === 'number' ? (
                    <span className={cn('ml-1.5 text-xs', selected ? 'text-admin-100' : 'text-slate-400')}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <Card className="space-y-3 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              className="flex-1"
              placeholder="Mã đơn CardOn, email, SĐT, mã NCC…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setPage(1);
                  void load();
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Select
                className="w-auto min-w-[9rem]"
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
              <Button size="sm" onClick={() => { setPage(1); void load(); }}>Lọc</Button>
              <Button size="sm" variant="secondary" onClick={() => setFiltersOpen((open) => !open)}>
                {filtersOpen ? 'Ẩn bộ lọc' : 'Bộ lọc nâng cao'}
              </Button>
              {activeChips.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={clearFilters}>Xóa bộ lọc</Button>
              ) : null}
            </div>
          </div>

          {filtersOpen ? (
            <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-2 xl:grid-cols-4">
              {preset === 'custom' ? (
                <>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-slate-500">Từ</span>
                    <Input type="date" value={from} onChange={(event) => { setPage(1); setFrom(event.target.value); }} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block text-xs text-slate-500">Đến</span>
                    <Input type="date" value={to} onChange={(event) => { setPage(1); setTo(event.target.value); }} />
                  </label>
                </>
              ) : null}
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Thanh toán</span>
                <Select
                  value={paymentStatus}
                  onChange={(event) => {
                    setPage(1);
                    setPaidUnfulfilled(false);
                    setPaymentStatus(event.target.value);
                  }}
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Fulfillment</span>
                <Select
                  value={fulfillmentStatus}
                  onChange={(event) => {
                    setPage(1);
                    setFulfillmentStatus(event.target.value);
                  }}
                >
                  {FULFILL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Thị trường</span>
                <Select value={market} onChange={(event) => { setPage(1); setMarket(event.target.value); }}>
                  <option value="">Mọi thị trường</option>
                  <option value="VN">VN</option>
                  <option value="INTL">INTL</option>
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-slate-500">Loại đơn</span>
                <Select value={lane} onChange={(event) => { setPage(1); setLane(event.target.value); }}>
                  <option value="">Mọi loại đơn</option>
                  <option value="commerce">Thương mại</option>
                  <option value="sandbox">Đơn thử</option>
                </Select>
              </label>
              <p className="text-xs text-slate-500 md:col-span-2 xl:col-span-4">
                Gateway / currency / quốc gia / package lọc trên danh sách đơn chưa có trên API Phase 4 — dùng trang Thanh toán hoặc bộ lọc báo cáo bên dưới.
              </p>
            </div>
          ) : null}

          {activeChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {activeChips.map((chip) => (
                <span key={chip.key} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}

          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Mã đơn</TH>
                  <TH>Khách hàng</TH>
                  <TH>Sản phẩm</TH>
                  <TH>Thị trường</TH>
                  <TH align="right">Thanh toán</TH>
                  <TH>Payment</TH>
                  <TH>Fulfillment</TH>
                  <TH>Thao tác</TH>
                </TR>
              </THead>
              <TBody>
                {loading && !data ? (
                  <TableSkeleton colSpan={8} />
                ) : !data || data.items.length === 0 ? (
                  <TableEmpty
                    colSpan={8}
                    message="Chưa có đơn eSIM khớp bộ lọc. Đơn eSIM bán lẻ phải có variant type ESIM — không nằm ở menu Đơn hàng thẻ/nạp."
                  />
                ) : (
                  data.items.map((item) => (
                    <TR key={item.id} className="hover:bg-slate-50/80">
                      <TD>
                        <div className="flex items-start gap-1.5">
                          <div>
                            <Link href={`/esim-ops/${item.id}`} className="font-mono text-xs font-semibold text-admin-700 hover:underline">
                              {item.orderCode}
                            </Link>
                            <p className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(item.createdAt)}</p>
                          </div>
                          <CopyIdButton value={item.orderCode} />
                        </div>
                      </TD>
                      <TD>
                        <p className="max-w-[12rem] truncate text-sm">{item.customerEmail ?? '—'}</p>
                        {item.customerName ? (
                          <p className="max-w-[12rem] truncate text-xs text-slate-500">{item.customerName}</p>
                        ) : null}
                      </TD>
                      <TD>
                        <p className="max-w-[14rem] truncate text-sm">{item.packageTitle ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {item.countryIso ?? '—'}
                          {item.providerProductCode ? ` · ${item.providerProductCode}` : ''}
                        </p>
                        {item.airaloOrderId ? (
                          <p className="font-mono text-[11px] text-slate-400">NCC {item.airaloOrderId}</p>
                        ) : null}
                      </TD>
                      <TD>
                        <Badge tone="neutral">{item.esimMarket ?? '—'}</Badge>
                        {item.lane === 'sandbox' ? <p className="mt-1 text-[11px] text-slate-400">Đơn thử</p> : null}
                      </TD>
                      <TD align="right" className="whitespace-nowrap font-medium">
                        {listChargeLabel(item)}
                      </TD>
                      <TD>
                        <Badge tone={paymentTone(item.paymentStatus)} status={item.paymentStatus} />
                        {item.paymentMethod ? (
                          <p className="mt-1 text-[11px] text-slate-500">{item.paymentMethod}</p>
                        ) : null}
                      </TD>
                      <TD>
                        <Badge tone={fulfillmentTone(item.fulfillmentStatus)} status={item.fulfillmentStatus} />
                        {item.lastError ? (
                          <p className="mt-1 max-w-[12rem] truncate text-[11px] text-amber-800" title={item.lastError}>
                            {item.lastError}
                          </p>
                        ) : null}
                      </TD>
                      <TD>
                        <Link
                          href={`/esim-ops/${item.id}`}
                          className="text-sm font-medium text-admin-700 hover:underline"
                        >
                          Chi tiết
                        </Link>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>

          <div className="space-y-3 md:hidden">
            {loading && !data ? (
              <p className="text-sm text-slate-500">Đang tải…</p>
            ) : !data || data.items.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có đơn eSIM khớp bộ lọc.</p>
            ) : (
              data.items.map((item) => <MobileOrderCard key={item.id} item={item} />)
            )}
          </div>

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

        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Báo cáo chi tiết</h2>
              <p className="text-xs text-slate-500">
                Cùng API dashboard hiện có. Bộ lọc báo cáo độc lập với danh sách đơn.
              </p>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  { id: 'revenue' as const, label: 'Doanh thu' },
                  { id: 'packages' as const, label: 'Gói' },
                  { id: 'countries' as const, label: 'Quốc gia' },
                  { id: 'economics' as const, label: 'Kinh tế snapshot' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setReportPanel(tab.id)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition',
                    reportPanel === tab.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Select value={reportMarket} onChange={(event) => setReportMarket(event.target.value)}>
              <option value="">Mọi thị trường</option>
              <option value="VN">VN</option>
              <option value="INTL">INTL</option>
            </Select>
            <Select value={reportCurrency} onChange={(event) => setReportCurrency(event.target.value)}>
              <option value="">Mọi currency</option>
              <option value="VND">VND</option>
              <option value="USD">USD</option>
            </Select>
            <Select value={reportGateway} onChange={(event) => setReportGateway(event.target.value)}>
              <option value="">Mọi cổng</option>
              <option value="SEPAY">Chuyển khoản (Viet QR)</option>
              <option value="PAYPAL">PayPal</option>
            </Select>
            <Select value={reportStatus} onChange={(event) => setReportStatus(event.target.value)}>
              <option value="">Mọi trạng thái đơn</option>
              {PAYMENT_OPTIONS.filter((option) => option.value).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </div>

          {reportPanel === 'revenue' ? (
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
          ) : null}

          {reportPanel === 'packages' ? (
            <div className="space-y-3">
              <h3 className="font-semibold">Gói bán chạy (commerce, theo số đơn PAID)</h3>
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
            </div>
          ) : null}

          {reportPanel === 'countries' ? (
            <div className="space-y-3">
              <h3 className="font-semibold">Theo quốc gia (commerce)</h3>
              <SimpleTable
                headers={['ISO', 'Đơn', 'PAID']}
                rows={(dashboard?.countries ?? []).map((row) => [
                  row.countryIso,
                  String(row.orders),
                  String(row.commercePaid),
                ])}
                empty="Chưa có đơn commerce trong khoảng."
              />
            </div>
          ) : null}

          {reportPanel === 'economics' ? (
            <div className="space-y-4">
              {dashboard?.snapshotEconomics ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <MoneyTotals title="Giá vốn snapshot theo currency" rows={dashboard.snapshotEconomics.costByCurrency} />
                  <MoneyTotals title="Lợi nhuận snapshot cùng currency" rows={dashboard.snapshotEconomics.profitByCurrency} />
                </div>
              ) : (
                <p className="text-sm text-slate-500">Chưa có số kinh tế snapshot trong khoảng.</p>
              )}
              {dashboard ? (
                <div className="space-y-1 text-sm text-slate-600">
                  <p>{dashboard.checkoutCostSnapshot.reason}</p>
                  <p>{dashboard.snapshotEconomics?.note}</p>
                  <p>
                    Không đối chiếu được: {dashboard.snapshotEconomics?.unreconciledOrders ?? 0} đơn. Thiếu snapshot: {dashboard.snapshotEconomics?.missingSnapshot ?? 0}.
                  </p>
                  <p>{dashboard.definitions.revenue}</p>
                  <p>{dashboard.definitions.installSuccessRate}</p>
                  <p className="text-xs text-amber-800">
                    Lợi nhuận kế toán eSIM (F1+) chỉ khi đủ giá vốn, phí gateway thực và quy tắc FX được KEYON chốt — số snapshot ở đây không phải sổ chính thức.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </EsimOpsShell>
    </RequirePermission>
  );
}

function MobileOrderCard({ item }: { item: EsimOpsListItem }) {
  return (
    <Link
      href={`/esim-ops/${item.id}`}
      className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-admin-200"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs font-semibold text-admin-700">{item.orderCode}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(item.createdAt)}</p>
        </div>
        <p className="text-sm font-semibold">{listChargeLabel(item)}</p>
      </div>
      <p className="mt-2 truncate text-sm">{item.customerEmail ?? item.customerName ?? '—'}</p>
      <p className="mt-1 truncate text-xs text-slate-600">
        {item.countryIso ? `${item.countryIso} · ` : ''}
        {item.packageTitle ?? '—'}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone={paymentTone(item.paymentStatus)} status={item.paymentStatus} />
        <Badge tone={fulfillmentTone(item.fulfillmentStatus)} status={item.fulfillmentStatus} />
        {item.esimMarket ? <Badge tone="neutral">{item.esimMarket}</Badge> : null}
      </div>
    </Link>
  );
}

function MoneyTotals({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ currency: string; amount: string; count: number }>;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-100 p-3">
      <h3 className="font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Không có số cùng currency trong bộ lọc.</p>
      ) : (
        rows.map((row) => (
          <p key={row.currency} className="text-sm">
            {row.currency} {formatEsimMoney(row.amount, row.currency)} · {row.count} đơn
          </p>
        ))
      )}
    </div>
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
    <div className="space-y-3 rounded-lg border border-slate-100 p-3">
      <h3 className="font-semibold">{title}</h3>
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
                <TD align="right">{formatEsimMoney(row.amount, row.currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
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
  active,
  hint,
  onClick,
}: {
  label: string;
  value: number;
  warn?: boolean;
  ok?: boolean;
  active?: boolean;
  hint?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg border px-3 py-2.5 text-left transition',
        active
          ? 'border-admin-300 bg-admin-50'
          : warn
            ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300'
            : ok
              ? 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300'
              : 'border-slate-200 bg-white hover:border-slate-300',
      )}
    >
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-slate-400" title={hint}>{hint}</p> : null}
    </button>
  );
}

function RevenueKpi({
  label,
  amount,
  hint,
}: {
  label: string;
  amount: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">{amount}</p>
      {hint ? <p className="mt-0.5 truncate text-[10px] text-slate-400" title={hint}>{hint}</p> : null}
    </div>
  );
}
