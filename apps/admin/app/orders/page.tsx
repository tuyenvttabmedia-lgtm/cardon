'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RequirePermission } from '@/components/layout/AdminShell';
import { OrderSummaryCards } from '@/components/orders/OrderSummaryCards';
import { Badge, Card, ErrorMessage, statusTone } from '@/components/ui/Display';
import { Button, Input, Label, Select } from '@/components/ui/Form';
import { translateStatus } from '@/lib/i18n';
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

function buildQueryParams(filters: Filters): Record<string, string | number> {
  const params: Record<string, string | number> = { take: 100 };
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
  return order.customerEmail ?? order.customerPhone ?? '—';
}

function profitClass(profit: string): string {
  return Number(profit) > 0 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium';
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<AdminOrderListItem[]>([]);
  const [summary, setSummary] = useState<AdminOrderSummary | null>(null);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const queryParams = useMemo(() => buildQueryParams(applied), [applied]);

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
        <h1 className="text-2xl font-bold">{vi.orders.title}</h1>

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
            Queue: Chờ thử lại NCC
          </Button>
        </div>

        <Card className="space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <Label>Tìm kiếm</Label>
              <Input
                className="mt-1"
                placeholder="Mã đơn, email, SĐT, mã giao dịch thanh toán/NCC, serial…"
                value={filters.q}
                onChange={(e) => setFilters({ ...filters, q: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
              />
            </div>
            <div>
              <Label>Thời gian</Label>
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
            {filters.datePreset === 'custom' && (
              <>
                <div>
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={filters.fromDate}
                    onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    className="mt-1"
                    value={filters.toDate}
                    onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
                  />
                </div>
              </>
            )}
            <div>
              <Label>Thanh toán</Label>
              <Select
                className="mt-1"
                value={filters.paymentFilter}
                onChange={(e) => setFilters({ ...filters, paymentFilter: e.target.value })}
              >
                <option value="">{vi.app.all}</option>
                {PAYMENT_FILTERS.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s === 'PENDING' ? 'Chờ thanh toán' : translateStatus(s)}
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
                <option value="">{vi.app.all}</option>
                {DELIVERY_FILTERS.filter(Boolean).map((s) => (
                  <option key={s} value={s}>
                    {s === 'WAITING_ADMIN_RETRY'
                      ? 'Chờ thử lại NCC'
                      : translateStatus(
                          s === 'DELIVERED'
                            ? 'COMPLETED'
                            : s === 'NEED_SUPPORT'
                              ? 'NEED_MANUAL_REVIEW'
                              : s,
                        )}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Loại sản phẩm</Label>
              <Select
                className="mt-1"
                value={filters.productType}
                onChange={(e) => setFilters({ ...filters, productType: e.target.value })}
              >
                <option value="">{vi.app.all}</option>
                {PRODUCT_TYPES.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
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
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={applyFilters}>{vi.app.filter}</Button>
            <Button variant="ghost" onClick={resetFilters}>
              Xóa bộ lọc
            </Button>
          </div>
        </Card>

        {error && <ErrorMessage message={error} />}

        <Card>
          {loading ? (
            <p className="p-4 text-zinc-500">{vi.app.loading}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-zinc-500">
                    <th className="py-2 pr-4">Mã đơn</th>
                    <th className="py-2 pr-4">Khách hàng</th>
                    <th className="py-2 pr-4">Loại</th>
                    <th className="py-2 pr-4 text-right">Thanh toán</th>
                    <th className="py-2 pr-4 text-right">Giá vốn</th>
                    <th className="py-2 pr-4 text-right">Lãi</th>
                    <th className="py-2 pr-4">PT thanh toán</th>
                    <th className="py-2 pr-4">Trạng thái</th>
                    <th className="py-2 pr-4">Ngày tạo</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-500">
                        Không có đơn hàng
                      </td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id} className="border-b border-zinc-50">
                        <td className="py-3 pr-4 font-mono text-xs">{o.orderCode}</td>
                        <td className="py-3 pr-4">{customerLabel(o)}</td>
                        <td className="py-3 pr-4">{o.productType}</td>
                        <td className="py-3 pr-4 text-right">{formatVnd(o.customerPaid)}</td>
                        <td className="py-3 pr-4 text-right">{formatVnd(o.providerCost)}</td>
                        <td className={`py-3 pr-4 text-right ${profitClass(o.profit)}`}>
                          {formatVnd(o.profit)}
                        </td>
                        <td className="py-3 pr-4">{o.paymentMethod ?? '—'}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={statusTone(o.fulfillmentStatus)} status={o.fulfillmentStatus} />
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                        <td className="py-3">
                          <Link
                            href={`/orders/${o.id}`}
                            className="text-sm text-admin-600 hover:underline"
                          >
                            {vi.common.detail}
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </RequirePermission>
  );
}
