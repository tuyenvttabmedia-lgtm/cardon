'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { OrderSummaryCards } from '@/components/orders/OrderSummaryCards';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { SectionNav } from '@/components/ui/Navigation';
import { Table, THead, TBody, TR, TH, TD, TableEmpty, TableSkeleton } from '@/components/ui/Table';
import { useAuth } from '@/hooks/useAuth';
import { vi } from '@/lib/i18n/vi';
import {
  datePresetLabel,
  resolveDatePreset,
  type DatePreset,
} from '@/lib/order-date-filters';
import { cn, formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { AdminOrderListItem, AdminOrderSummary, ProviderStatus } from '@/types/api';

const PAYMENT_FILTERS: { value: string; label: string }[] = [
  { value: '', label: vi.app.all },
  { value: 'UNPAID', label: 'Chưa thanh toán (chờ + hết hạn)' },
  { value: 'WAITING_PAYMENT', label: vi.status.WAITING_PAYMENT },
  { value: 'EXPIRED', label: vi.status.EXPIRED },
  { value: 'PAID', label: vi.status.PAID },
  { value: 'FAILED', label: vi.status.FAILED },
  { value: 'REFUNDED', label: vi.status.REFUNDED },
];

const DELIVERY_FILTERS: { value: string; label: string }[] = [
  { value: '', label: vi.app.all },
  { value: 'AWAITING_DELIVERY', label: vi.orders.waitingDeliveryFilter },
  { value: 'WAITING_ADMIN_RETRY', label: vi.status.WAITING_ADMIN_RETRY },
  { value: 'PROCESSING', label: vi.status.PROCESSING },
  { value: 'DELIVERED', label: vi.status.COMPLETED },
  { value: 'FAILED', label: vi.status.FAILED },
  { value: 'NEED_SUPPORT', label: 'Cần hỗ trợ' },
];

const RETRYABLE_FULFILLMENT = new Set([
  'WAITING_ADMIN_RETRY',
  'NEED_MANUAL_REVIEW',
  'PENDING',
]);

const PRODUCT_TYPES = ['', 'CARD', 'TOPUP', 'DATA', 'ESIM'] as const;

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last7', label: '7 ngày' },
  { value: 'last30', label: '30 ngày' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'custom', label: 'Tùy chọn' },
  { value: 'all', label: 'Mọi thời gian' },
];

const PAGE_SIZES = [25, 50, 100] as const;

/** Wave A Exception Center buckets — mutually exclusive. */
type ExceptionBucket = 'pending' | 'processing' | 'attention' | '';

/** Sub-filter inside «Cần xử lý» — real FulfillmentStatus enum values only. */
type AttentionSub = 'FAILED' | 'WAITING_ADMIN_RETRY' | 'NEED_MANUAL_REVIEW';

/**
 * Status Overview quick filters (no live counts in Wave A).
 * Maps only to existing paymentFilter / fulfillmentStatus / deliveryStatus params.
 */
type StatusQuick =
  | ''
  | 'waiting_payment'
  | 'paid_pending'
  | 'processing'
  | 'delivered'
  | 'need_attention'
  | 'expired';

type ChannelMode = 'B2C' | 'AGENT';

type ListState = {
  q: string;
  datePreset: DatePreset;
  fromDate: string;
  toDate: string;
  paymentFilter: string;
  deliveryStatus: string;
  fulfillmentStatus: string;
  productType: string;
  providerId: string;
  exception: ExceptionBucket;
  attentionSub: AttentionSub;
  statusQuick: StatusQuick;
  page: number;
  take: number;
  filtersOpen: boolean;
};

const DEFAULT_STATE: ListState = {
  q: '',
  datePreset: 'today',
  fromDate: '',
  toDate: '',
  paymentFilter: '',
  deliveryStatus: '',
  fulfillmentStatus: '',
  productType: '',
  providerId: '',
  exception: '',
  attentionSub: 'WAITING_ADMIN_RETRY',
  statusQuick: '',
  page: 1,
  take: 25,
  filtersOpen: false,
};

function parsePreset(raw: string | null): DatePreset {
  const allowed: DatePreset[] = [
    'today',
    'yesterday',
    'last7',
    'last30',
    'thisMonth',
    'lastMonth',
    'custom',
    'all',
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as DatePreset;
  return 'today';
}

function parseException(raw: string | null): ExceptionBucket {
  if (raw === 'pending' || raw === 'processing' || raw === 'attention') return raw;
  return '';
}

function parseAttentionSub(raw: string | null): AttentionSub {
  if (raw === 'FAILED' || raw === 'WAITING_ADMIN_RETRY' || raw === 'NEED_MANUAL_REVIEW') {
    return raw;
  }
  return 'WAITING_ADMIN_RETRY';
}

function parseStatusQuick(raw: string | null): StatusQuick {
  const allowed: StatusQuick[] = [
    'waiting_payment',
    'paid_pending',
    'processing',
    'delivered',
    'need_attention',
    'expired',
  ];
  if (raw && (allowed as string[]).includes(raw)) return raw as StatusQuick;
  return '';
}

function parseTake(raw: string | null): number {
  const n = Number(raw);
  if (n === 50 || n === 100) return n;
  return 25;
}

function stateFromSearchParams(params: URLSearchParams): ListState {
  return {
    q: params.get('q') ?? '',
    datePreset: parsePreset(params.get('preset')),
    fromDate: params.get('from') ?? '',
    toDate: params.get('to') ?? '',
    paymentFilter: params.get('payment') ?? '',
    deliveryStatus: params.get('delivery') ?? '',
    fulfillmentStatus: params.get('fulfillment') ?? '',
    productType: params.get('product') ?? '',
    providerId: params.get('provider') ?? '',
    exception: parseException(params.get('ex')),
    attentionSub: parseAttentionSub(params.get('attn')),
    statusQuick: parseStatusQuick(params.get('status')),
    page: Math.max(1, Number(params.get('page') || 1) || 1),
    take: parseTake(params.get('take')),
    filtersOpen: params.get('adv') === '1',
  };
}

function stateToSearchParams(state: ListState): URLSearchParams {
  const q = new URLSearchParams();
  if (state.q.trim()) q.set('q', state.q.trim());
  if (state.datePreset !== 'today') q.set('preset', state.datePreset);
  if (state.datePreset === 'custom') {
    if (state.fromDate) q.set('from', state.fromDate);
    if (state.toDate) q.set('to', state.toDate);
  }
  if (state.paymentFilter) q.set('payment', state.paymentFilter);
  if (state.deliveryStatus) q.set('delivery', state.deliveryStatus);
  if (state.fulfillmentStatus) q.set('fulfillment', state.fulfillmentStatus);
  if (state.productType) q.set('product', state.productType);
  if (state.providerId) q.set('provider', state.providerId);
  if (state.exception) q.set('ex', state.exception);
  if (state.exception === 'attention' && state.attentionSub !== 'WAITING_ADMIN_RETRY') {
    q.set('attn', state.attentionSub);
  }
  if (state.statusQuick) q.set('status', state.statusQuick);
  if (state.page > 1) q.set('page', String(state.page));
  if (state.take !== 25) q.set('take', String(state.take));
  if (state.filtersOpen) q.set('adv', '1');
  return q;
}

function kpiRangeLabel(state: ListState): string {
  if (state.datePreset === 'custom') {
    if (state.fromDate || state.toDate) {
      return `${state.fromDate || '…'} → ${state.toDate || '…'}`;
    }
    return 'Tùy chọn (chưa chọn ngày)';
  }
  if (state.datePreset === 'all') return 'Mọi thời gian';
  const range = resolveDatePreset(state.datePreset);
  if (range.fromDate && range.toDate) {
    return `${datePresetLabel(state.datePreset)} (${range.fromDate} → ${range.toDate})`;
  }
  return datePresetLabel(state.datePreset);
}

function applyStatusQuick(quick: StatusQuick): Partial<ListState> {
  // Status Overview keeps KPI date range. Exception Center is separate (clears dates).
  switch (quick) {
    case 'waiting_payment':
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: 'WAITING_PAYMENT',
        deliveryStatus: '',
        fulfillmentStatus: '',
      };
    case 'paid_pending':
      // PENDING (chưa giao) + WAITING_ADMIN_RETRY (hết tiền NCC / cần giao lại).
      // Không chỉ PENDING — regression UX so với nút «Đơn chờ giao» cũ.
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: 'PAID',
        deliveryStatus: 'AWAITING_DELIVERY',
        fulfillmentStatus: '',
      };
    case 'processing':
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: '',
        deliveryStatus: '',
        fulfillmentStatus: 'PROCESSING',
      };
    case 'delivered':
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: '',
        deliveryStatus: 'DELIVERED',
        fulfillmentStatus: '',
      };
    case 'need_attention':
      // Closest multi-status without new API: NEED_SUPPORT = NEED_MANUAL_REVIEW + WAITING_ADMIN_RETRY.
      // FAILED is available under Exception → Cần xử lý → FAILED.
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: 'PAID',
        deliveryStatus: 'NEED_SUPPORT',
        fulfillmentStatus: '',
      };
    case 'expired':
      return {
        statusQuick: quick,
        exception: '',
        paymentFilter: 'EXPIRED',
        deliveryStatus: '',
        fulfillmentStatus: '',
      };
    default:
      return { statusQuick: '' };
  }
}

function buildListParams(
  state: ListState,
  channel: ChannelMode,
): Record<string, string | number> {
  const params: Record<string, string | number> = {
    take: state.take,
    skip: (state.page - 1) * state.take,
    channel,
  };

  if (state.q.trim()) params.q = state.q.trim();
  if (state.productType) params.productType = state.productType;
  else if (channel === 'B2C') params.excludeProductType = 'ESIM';
  if (state.providerId) params.providerId = state.providerId;

  const exceptionMode = Boolean(state.exception);

  if (exceptionMode) {
    params.paymentFilter = 'PAID';
    if (state.exception === 'pending') {
      params.fulfillmentStatus = 'PENDING';
    } else if (state.exception === 'processing') {
      params.fulfillmentStatus = 'PROCESSING';
    } else if (state.exception === 'attention') {
      params.fulfillmentStatus = state.attentionSub;
    }
    // Exception Center: no dateFrom/dateTo (all-time PAID not-completed buckets).
    return params;
  }

  if (state.paymentFilter) params.paymentFilter = state.paymentFilter;
  if (state.deliveryStatus) params.deliveryStatus = state.deliveryStatus;
  if (state.fulfillmentStatus) params.fulfillmentStatus = state.fulfillmentStatus;

  // Exact-ish order-code search: don't hide hits behind KPI day window.
  const qTrim = state.q.trim();
  const looksLikeOrderCode = /^ORD[-_]/i.test(qTrim);
  if (!looksLikeOrderCode) {
    if (state.datePreset === 'custom') {
      if (state.fromDate) params.dateFrom = state.fromDate;
      if (state.toDate) params.dateTo = state.toDate;
    } else if (state.datePreset !== 'all') {
      const range = resolveDatePreset(state.datePreset);
      if (range.fromDate) params.dateFrom = range.fromDate;
      if (range.toDate) params.dateTo = range.toDate;
    }
  }

  return params;
}

function buildSummaryParams(
  state: ListState,
  channel: ChannelMode,
): Record<string, string | number> {
  // KPI always follows the selected date preset (never cleared by Exception mode).
  const kpiState: ListState = {
    ...state,
    exception: '',
    statusQuick: '',
    paymentFilter: '',
    deliveryStatus: '',
    fulfillmentStatus: '',
    page: 1,
  };
  return buildListParams(kpiState, channel);
}

function customerLabel(order: AdminOrderListItem): string {
  if (order.channel === 'AGENT') {
    return order.agentName ?? '—';
  }
  return order.customerEmail ?? order.customerPhone ?? '—';
}

function profitClass(profit: string): string {
  return Number(profit) > 0 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium';
}

function OrdersListInner({ channel }: { channel: ChannelMode }) {
  const isAgent = channel === 'AGENT';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { can } = useAuth();

  const [state, setState] = useState<ListState>(() => stateFromSearchParams(searchParams));
  const [qDraft, setQDraft] = useState(() => searchParams.get('q') ?? '');
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Sync from URL when browser back/forward changes query (after first paint).
  useEffect(() => {
    const next = stateFromSearchParams(searchParams);
    const nextKey = stateToSearchParams(next).toString();
    const stateKey = stateToSearchParams(state).toString();
    if (nextKey !== stateKey) {
      setState(next);
      setQDraft(next.q);
    } else if (qDraft !== next.q && document.activeElement?.tagName !== 'INPUT') {
      setQDraft(next.q);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL is source of truth on popstate
  }, [searchParams]);

  // Push state → URL (shareable / restore when returning from detail).
  useEffect(() => {
    if (!hydrated) return;
    const next = stateToSearchParams(state).toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [state, hydrated, pathname, router, searchParams]);

  // Debounce search 350ms → update list state (resets page).
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setState((prev) => {
        const nextQ = qDraft.trim();
        if (prev.q === nextQ) return prev;
        return { ...prev, q: nextQ, page: 1 };
      });
    }, 350);
    return () => window.clearTimeout(handle);
  }, [qDraft]);

  const listParams = useMemo(() => buildListParams(state, channel), [state, channel]);
  const summaryParams = useMemo(() => buildSummaryParams(state, channel), [state, channel]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stats] = await Promise.all([
        adminApi.listOrders(listParams),
        adminApi.getOrdersSummary(summaryParams),
      ]);
      setOrders(list);
      setSummary(stats);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.orders.loadError);
    } finally {
      setLoading(false);
    }
  }, [listParams, summaryParams]);

  useEffect(() => {
    void adminApi.getProvidersStatus().then(setProviders).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void load();
  }, [load, hydrated]);

  const hasMore = orders.length === state.take;
  const rangeLabel = kpiRangeLabel(state);
  const exceptionActive = Boolean(state.exception);

  function patch(partial: Partial<ListState>, resetPage = true) {
    setState((prev) => ({
      ...prev,
      ...partial,
      ...(resetPage ? { page: 1 } : {}),
    }));
  }

  function selectException(bucket: ExceptionBucket) {
    if (!bucket) {
      patch({ exception: '', statusQuick: '' });
      return;
    }
    patch({
      exception: bucket,
      statusQuick: '',
      paymentFilter: '',
      deliveryStatus: '',
      fulfillmentStatus: '',
    });
  }

  function selectStatusQuick(quick: StatusQuick) {
    if (!quick || state.statusQuick === quick) {
      patch({
        statusQuick: '',
        exception: '',
        paymentFilter: '',
        deliveryStatus: '',
        fulfillmentStatus: '',
      });
      return;
    }
    patch(applyStatusQuick(quick));
  }

  function resetFilters() {
    setQDraft('');
    setState({ ...DEFAULT_STATE });
  }

  async function retryFromList(order: AdminOrderListItem) {
    if (retryingId || !can('orders.retry')) return;
    const ok = window.confirm(
      `Giao lại đơn ${order.orderCode}?\nKhách trả: ${formatVnd(order.customerPaid)}\nTrạng thái giao: ${order.fulfillmentStatus}`,
    );
    if (!ok) return;
    setRetryingId(order.id);
    setActionMessage(null);
    setError(null);
    try {
      const result = await adminApi.retryOrder(order.id);
      const status = result?.fulfillmentStatus;
      setActionMessage(
        status && status !== 'COMPLETED'
          ? `${order.orderCode}: giao lại xong (${status}) — chưa hoàn tất, kiểm tra chi tiết.`
          : `${order.orderCode}: giao lại thành công`,
      );
      await load();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : `Giao lại ${order.orderCode} thất bại`,
      );
    } finally {
      setRetryingId(null);
    }
  }

  const statusChips: { id: StatusQuick; label: string }[] = [
    { id: 'waiting_payment', label: 'Chờ thanh toán' },
    { id: 'paid_pending', label: 'Đã TT / chờ giao' },
    { id: 'processing', label: 'Đang xử lý' },
    { id: 'delivered', label: 'Giao thành công' },
    { id: 'need_attention', label: 'Thất bại / cần XL' },
    { id: 'expired', label: 'Hết hạn' },
  ];

  const colSpan = isAgent ? 13 : 11;

  return (
    <RequirePermission permission="orders.read">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="admin-page-title">
              {isAgent ? 'Đơn hàng đại lý (API)' : 'Trung tâm vận hành đơn hàng'}
            </h1>
            <p className="admin-page-subtitle">
              {isAgent
                ? 'Chỉ đơn channel AGENT — tách biệt đơn bán lẻ web.'
                : 'Quản lý đơn hàng bán lẻ, theo dõi thanh toán và tình trạng giao hàng.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? 'Đang tải…' : 'Làm mới'}
            </Button>
            <SectionNav
              ariaLabel="Loại đơn hàng"
              items={[
                { href: '/orders', label: 'Bán lẻ', active: !isAgent },
                { href: '/orders/agent', label: 'Đại lý API', active: isAgent },
              ]}
            />
          </div>
        </div>

        <Card className="space-y-3 p-3 sm:p-4">
          <OrderSummaryCards summary={summary} rangeLabel={rangeLabel} loading={loading} />
        </Card>

        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Exception Center
              </p>
              <p className="text-[11px] text-slate-400">
                PAID · chưa COMPLETED · không giới hạn kỳ KPI · 3 bucket loại trừ nhau
              </p>
            </div>
            {exceptionActive ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
                Đang xem mọi thời gian
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: 'pending' as const, label: 'Chờ giao', hint: 'PAID + PENDING' },
                { id: 'processing' as const, label: 'Đang xử lý', hint: 'PAID + PROCESSING' },
                {
                  id: 'attention' as const,
                  label: 'Cần xử lý',
                  hint: 'PAID + FAILED / WAITING_ADMIN_RETRY / NEED_MANUAL_REVIEW · mặc định: chờ admin retry',
                },
              ] as const
            ).map((bucket) => (
              <button
                key={bucket.id}
                type="button"
                title={bucket.hint}
                onClick={() =>
                  selectException(state.exception === bucket.id ? '' : bucket.id)
                }
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition',
                  state.exception === bucket.id
                    ? 'border-amber-300 bg-amber-50 text-amber-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-amber-200',
                )}
              >
                <span className="font-medium">{bucket.label}</span>
                <span className="mt-0.5 block text-[10px] text-slate-400">{bucket.hint}</span>
              </button>
            ))}
          </div>
          {state.exception === 'attention' ? (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
              <span className="self-center px-1 text-[11px] text-slate-500">Chi tiết:</span>
              {(
                [
                  { id: 'WAITING_ADMIN_RETRY' as const, label: 'Chờ admin retry' },
                  { id: 'NEED_MANUAL_REVIEW' as const, label: 'Cần review' },
                  { id: 'FAILED' as const, label: 'FAILED' },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => patch({ attentionSub: sub.id, exception: 'attention' })}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium',
                    state.attentionSub === sub.id
                      ? 'bg-admin-600 text-white'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          ) : null}
        </Card>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Trạng thái đơn (quick filter · không đếm)
          </p>
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {statusChips.map((chip) => {
                const selected = state.statusQuick === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => selectStatusQuick(chip.id)}
                    className={cn(
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition',
                      selected
                        ? 'bg-admin-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <Label>Tìm kiếm</Label>
              <Input
                className="mt-1"
                placeholder={
                  isAgent
                    ? 'Mã đơn, request_id, tên đại lý…'
                    : 'Mã đơn, email, SĐT, mã giao dịch thanh toán/NCC…'
                }
                value={qDraft}
                onChange={(e) => setQDraft(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Debounce 350ms. Gõ mã ORD-… sẽ bỏ kỳ KPI. Đơn chờ giao lại nằm tab «Đã TT / chờ giao» hoặc Exception «Cần xử lý».
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <div>
                <Label>Kỳ KPI / danh sách</Label>
                <Select
                  className="mt-1 min-w-[9rem]"
                  value={state.datePreset}
                  disabled={exceptionActive}
                  onChange={(e) =>
                    patch({ datePreset: e.target.value as DatePreset, statusQuick: state.statusQuick })
                  }
                >
                  {DATE_PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => patch({ filtersOpen: !state.filtersOpen }, false)}
                >
                  {state.filtersOpen ? 'Ẩn bộ lọc' : 'Bộ lọc nâng cao'}
                </Button>
                <Button size="sm" variant="ghost" onClick={resetFilters}>
                  Xóa bộ lọc
                </Button>
              </div>
            </div>
          </div>

          {exceptionActive ? (
            <p className="rounded-lg border border-dashed border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-950">
              Exception đang bật: danh sách bỏ date filter. KPI phía trên vẫn theo kỳ «{rangeLabel}».
            </p>
          ) : null}

          {state.filtersOpen ? (
            <div className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/80 p-3 md:grid-cols-2 xl:grid-cols-4">
              {state.datePreset === 'custom' && !exceptionActive ? (
                <>
                  <div>
                    <Label>Từ ngày</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={state.fromDate}
                      onChange={(e) => patch({ fromDate: e.target.value, datePreset: 'custom' })}
                    />
                  </div>
                  <div>
                    <Label>Đến ngày</Label>
                    <Input
                      className="mt-1"
                      type="date"
                      value={state.toDate}
                      onChange={(e) => patch({ toDate: e.target.value, datePreset: 'custom' })}
                    />
                  </div>
                </>
              ) : null}
              <div>
                <Label>Thanh toán</Label>
                <Select
                  className="mt-1"
                  value={state.paymentFilter}
                  disabled={exceptionActive}
                  onChange={(e) =>
                    patch({
                      paymentFilter: e.target.value,
                      exception: '',
                      statusQuick: '',
                    })
                  }
                >
                  {PAYMENT_FILTERS.map((t) => (
                    <option key={t.value || 'all'} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Giao hàng</Label>
                <Select
                  className="mt-1"
                  value={state.deliveryStatus}
                  disabled={exceptionActive}
                  onChange={(e) =>
                    patch({
                      deliveryStatus: e.target.value,
                      fulfillmentStatus: '',
                      exception: '',
                      statusQuick: '',
                    })
                  }
                >
                  {DELIVERY_FILTERS.map((t) => (
                    <option key={t.value || 'all'} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Loại SP</Label>
                <Select
                  className="mt-1"
                  value={state.productType}
                  onChange={(e) => patch({ productType: e.target.value })}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t || 'all'} value={t}>
                      {t || vi.app.all}
                    </option>
                  ))}
                </Select>
              </div>
              {!isAgent ? (
                <div>
                  <Label>NCC</Label>
                  <Select
                    className="mt-1"
                    value={state.providerId}
                    onChange={(e) => patch({ providerId: e.target.value })}
                  >
                    <option value="">{vi.app.all}</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>

        {error && <ErrorMessage message={error} />}
        {actionMessage ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {actionMessage}
          </p>
        ) : null}

        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <THead>
                <TR>
                  <TH>Mã đơn</TH>
                  {isAgent && <TH>Request ID</TH>}
                  <TH>{isAgent ? 'Đại lý' : 'Khách hàng'}</TH>
                  {isAgent && <TH>MT</TH>}
                  <TH>Loại</TH>
                  <TH align="right">{isAgent ? 'Số trừ hạn mức' : 'Khách trả'}</TH>
                  <TH align="right" className="hidden lg:table-cell">
                    Giá vốn
                  </TH>
                  <TH align="right">Lãi</TH>
                  <TH className="hidden md:table-cell">PT thanh toán</TH>
                  <TH>Trạng thái TT</TH>
                  <TH>Giao hàng</TH>
                  <TH className="hidden sm:table-cell">Ngày tạo</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {loading ? (
                  <TableSkeleton colSpan={colSpan} />
                ) : orders.length === 0 ? (
                  <TableEmpty colSpan={colSpan} message="Không có đơn hàng" />
                ) : (
                  orders.map((o) => (
                    <TR key={o.id}>
                      <TD className="font-mono text-xs">{o.orderCode}</TD>
                      {isAgent && (
                        <TD className="font-mono text-xs">{o.agentRequestId ?? '—'}</TD>
                      )}
                      <TD className="max-w-[10rem] truncate sm:max-w-none">{customerLabel(o)}</TD>
                      {isAgent && (
                        <TD>
                          {o.isSandbox ? (
                            <Badge tone="warning">Sandbox</Badge>
                          ) : (
                            <Badge tone="success">Live</Badge>
                          )}
                        </TD>
                      )}
                      <TD>{o.productType}</TD>
                      <TD align="right" className="whitespace-nowrap tabular-nums">
                        {formatVnd(o.customerPaid)}
                      </TD>
                      <TD
                        align="right"
                        className="hidden whitespace-nowrap tabular-nums lg:table-cell"
                      >
                        {formatVnd(o.providerCost)}
                      </TD>
                      <TD
                        align="right"
                        className={cn('whitespace-nowrap tabular-nums', profitClass(o.profit))}
                      >
                        {formatVnd(o.profit)}
                      </TD>
                      <TD className="hidden md:table-cell">{o.paymentMethod ?? '—'}</TD>
                      <TD>
                        <Badge tone={statusTone(o.paymentStatus)} status={o.paymentStatus} />
                      </TD>
                      <TD>
                        <Badge
                          tone={statusTone(o.fulfillmentStatus)}
                          status={o.fulfillmentStatus}
                        />
                      </TD>
                      <TD className="hidden whitespace-nowrap sm:table-cell">
                        {formatDateTime(o.createdAt)}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {can('orders.retry') &&
                          o.paymentStatus === 'PAID' &&
                          RETRYABLE_FULFILLMENT.has(o.fulfillmentStatus) ? (
                            <button
                              type="button"
                              disabled={retryingId === o.id || loading}
                              onClick={() => void retryFromList(o)}
                              className="text-sm font-medium text-amber-800 hover:underline disabled:opacity-50"
                            >
                              {retryingId === o.id ? '…' : vi.orders.retryFulfillment}
                            </button>
                          ) : null}
                          <Link
                            href={`/orders/${o.id}`}
                            className="text-sm text-admin-600 hover:underline"
                          >
                            {vi.common.detail}
                          </Link>
                        </div>
                      </TD>
                    </TR>
                  ))
                )}
              </TBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-3 py-2.5 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-xs text-slate-500">Mỗi trang</span>
              <Select
                className="w-auto"
                value={String(state.take)}
                onChange={(e) => patch({ take: Number(e.target.value), page: 1 })}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
              <span className="text-xs text-slate-400">
                Trang {state.page}
                {hasMore ? '+' : ''} · sort createdAt DESC
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={state.page <= 1 || loading}
                onClick={() => patch({ page: state.page - 1 }, false)}
              >
                Trước
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!hasMore || loading}
                onClick={() => patch({ page: state.page + 1 }, false)}
              >
                Sau
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </RequirePermission>
  );
}

export function OrdersListPageClient({ channel }: { channel: ChannelMode }) {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-slate-500">{vi.app.loading}</p>}>
      <OrdersListInner channel={channel} />
    </Suspense>
  );
}
