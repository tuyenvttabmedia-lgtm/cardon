'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { OrderSummaryCards } from '@/components/orders/OrderSummaryCards';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { SectionNav } from '@/components/ui/Navigation';
import { Table, THead, TBody, TR, TH, TD, TableEmpty, TableSkeleton } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { resolveDatePreset, type DatePreset } from '@/lib/order-date-filters';
import { formatDateTime, formatVnd } from '@/lib/utils';
import { adminApi, ApiClientError } from '@/services/api-client';
import type { AdminOrderListItem, AdminOrderSummary, ProviderStatus } from '@/types/api';

const PAYMENT_FILTERS = ['', 'PENDING', 'PAID', 'FAILED', 'REFUNDED'] as const;
const DELIVERY_FILTERS = [
  '',
  'WAITING_ADMIN_RETRY',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'NEED_SUPPORT',
] as const;
const PRODUCT_TYPES = ['', 'CARD', 'TOPUP', 'DATA'] as const;
const DATE_PRESETS: { value: DatePreset | ''; label: string }[] = [
  { value: '', label: vi.app.all },
  { value: 'today', label: 'Hôm nay' },
  { value: 'yesterday', label: 'Hôm qua' },
  { value: 'last7', label: '7 ngày' },
  { value: 'thisMonth', label: 'Tháng này' },
  { value: 'lastMonth', label: 'Tháng trước' },
  { value: 'custom', label: 'Tùy chọn' },
];

type ChannelMode = 'B2C' | 'AGENT';

type Filters = {
  q: string;
  datePreset: DatePreset | '';
  fromDate: string;
  toDate: string;
  paymentFilter: string;
  deliveryStatus: string;
  productType: string;
  providerId: string;
};

const DEFAULT_FILTERS: Filters = {
  q: '',
  datePreset: '',
  fromDate: '',
  toDate: '',
  paymentFilter: '',
  deliveryStatus: '',
  productType: '',
  providerId: '',
};

function buildQueryParams(
  filters: Filters,
  channel: ChannelMode,
): Record<string, string | number> {
  const params: Record<string, string | number> = { take: 100, channel };
  if (filters.q.trim()) params.q = filters.q.trim();
  if (filters.paymentFilter) params.paymentFilter = filters.paymentFilter;
  if (filters.deliveryStatus) params.deliveryStatus = filters.deliveryStatus;
  if (filters.productType) params.productType = filters.productType;
  if (filters.providerId) params.providerId = filters.providerId;

  if (filters.datePreset && filters.datePreset !== 'custom') {
    const range = resolveDatePreset(filters.datePreset);
    if (range.fromDate) params.dateFrom = range.fromDate;
    if (range.toDate) params.dateTo = range.toDate;
  } else if (filters.datePreset === 'custom') {
    if (filters.fromDate) params.dateFrom = filters.fromDate;
    if (filters.toDate) params.dateTo = filters.toDate;
  }

  return params;
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

export function OrdersListPageClient({ channel }: { channel: ChannelMode }) {
  const isAgent = channel === 'AGENT';
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const queryParams = useMemo(() => buildQueryParams(applied, channel), [applied, channel]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, stats] = await Promise.all([
        adminApi.listOrders(queryParams),
        adminApi.getOrdersSummary(queryParams),
      ]);
      setOrders(list);
      setSummary(stats);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : vi.orders.loadError);
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    void adminApi.getProvidersStatus().then(setProviders).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters() {
    setApplied(filters);
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
    setApplied(DEFAULT_FILTERS);
  }

  return (
    <RequirePermission permission="orders.read">
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="admin-page-title">
              {isAgent ? 'Đơn hàng đại lý (API)' : vi.orders.title}
            </h1>
            <p className="admin-page-subtitle">
              {isAgent
                ? 'Chỉ đơn channel AGENT — tách biệt đơn bán lẻ web.'
                : 'Chỉ đơn bán lẻ (B2C). Đơn đại lý xem tại Đơn đại lý.'}
            </p>
          </div>
          <SectionNav
            ariaLabel="Loại đơn hàng"
            items={[
              { href: '/orders', label: 'Bán lẻ', active: !isAgent },
              { href: '/orders/agent', label: 'Đại lý API', active: isAgent },
            ]}
          />
        </div>

        <OrderSummaryCards summary={summary} />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={applied.deliveryStatus === 'WAITING_ADMIN_RETRY' ? 'primary' : 'secondary'}
            onClick={() => {
              const next = { ...DEFAULT_FILTERS, deliveryStatus: 'WAITING_ADMIN_RETRY' };
              setFilters(next);
              setApplied(next);
            }}
          >
            {vi.orders.waitingDeliveryFilter}
          </Button>
        </div>

        <Card className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label>Tìm kiếm</Label>
              <Input
                className="mt-1"
                placeholder={
                  isAgent
                    ? 'Mã đơn, request_id, tên đại lý…'
                    : 'Mã đơn, email, SĐT, mã giao dịch thanh toán/NCC…'
                }
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              />
            </div>
            <div>
              <Label>Kỳ</Label>
              <Select
                className="mt-1"
                value={filters.datePreset}
                onChange={(e) =>
                  setFilters({ ...filters, datePreset: e.target.value as DatePreset | '' })
                }
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.value || 'all'} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Thanh toán</Label>
              <Select
                className="mt-1"
                value={filters.paymentFilter}
                onChange={(e) => setFilters({ ...filters, paymentFilter: e.target.value })}
              >
                {PAYMENT_FILTERS.map((t) => (
                  <option key={t || 'all'} value={t}>
                    {t || vi.app.all}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Giao hàng</Label>
              <Select
                className="mt-1"
                value={filters.deliveryStatus}
                onChange={(e) => setFilters({ ...filters, deliveryStatus: e.target.value })}
              >
                {DELIVERY_FILTERS.map((t) => (
                  <option key={t || 'all'} value={t}>
                    {t || vi.app.all}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Loại SP</Label>
              <Select
                className="mt-1"
                value={filters.productType}
                onChange={(e) => setFilters({ ...filters, productType: e.target.value })}
              >
                {PRODUCT_TYPES.map((t) => (
                  <option key={t || 'all'} value={t}>
                    {t || vi.app.all}
                  </option>
                ))}
              </Select>
            </div>
            {!isAgent && (
              <div>
                <Label>NCC</Label>
                <Select
                  className="mt-1"
                  value={filters.providerId}
                  onChange={(e) => setFilters({ ...filters, providerId: e.target.value })}
                >
                  <option value="">{vi.app.all}</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {filters.datePreset === 'custom' && (
              <>
                <div>
                  <Label>Từ ngày</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Đến ngày</Label>
                  <Input
                    className="mt-1"
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={applyFilters}>{vi.app.filter}</Button>
            <Button variant="ghost" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          </div>
        </Card>

        {error && <ErrorMessage message={error} />}

        <Card className="p-0">
          <Table className="min-w-full">
            <THead>
              <TR>
                <TH>Mã đơn</TH>
                {isAgent && <TH>Request ID</TH>}
                <TH>{isAgent ? 'Đại lý' : 'Khách hàng'}</TH>
                {isAgent && <TH>MT</TH>}
                <TH>Loại</TH>
                <TH align="right">{isAgent ? 'Số trừ hạn mức' : 'Thanh toán'}</TH>
                <TH align="right">Giá vốn</TH>
                <TH align="right">Lãi</TH>
                <TH>PT thanh toán</TH>
                <TH>Trạng thái</TH>
                <TH>Ngày tạo</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {loading ? (
                <TableSkeleton colSpan={isAgent ? 12 : 10} />
              ) : orders.length === 0 ? (
                <TableEmpty colSpan={isAgent ? 12 : 10} message="Không có đơn hàng" />
              ) : (
                orders.map((o) => (
                  <TR key={o.id}>
                    <TD className="font-mono text-xs">{o.orderCode}</TD>
                    {isAgent && <TD className="font-mono text-xs">{o.agentRequestId ?? '—'}</TD>}
                    <TD>{customerLabel(o)}</TD>
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
                    <TD align="right">{formatVnd(o.customerPaid)}</TD>
                    <TD align="right">{formatVnd(o.providerCost)}</TD>
                    <TD align="right" className={profitClass(o.profit)}>
                      {formatVnd(o.profit)}
                    </TD>
                    <TD>{o.paymentMethod ?? '—'}</TD>
                    <TD>
                      <Badge tone={statusTone(o.fulfillmentStatus)} status={o.fulfillmentStatus} />
                    </TD>
                    <TD className="whitespace-nowrap">{formatDateTime(o.createdAt)}</TD>
                    <TD>
                      <Link
                        href={`/orders/${o.id}`}
                        className="text-sm text-admin-600 hover:underline"
                      >
                        {vi.common.detail}
                      </Link>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </div>
    </RequirePermission>
  );
}
