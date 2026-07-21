'use client';

import { useEffect, useMemo, useState } from 'react';
import { AccountOrderExpanded } from '@/components/account/AccountOrderExpanded';
import { isDataServiceVisible, useSiteConfig } from '@/hooks/useSiteConfig';
import { ListPagination } from '@/components/ui/ListPagination';
import { accountApi } from '@/services/api-client';
import type { AccountOrder } from '@/types/api';
import { formatVnd, cn } from '@/lib/utils';
import { paymentStatusLabelVi, resolveCustomerOrderStatusLabel } from '@/lib/order-labels';

type OrderTypeFilter = 'all' | 'CARD' | 'TOPUP' | 'DATA';
type OrderStatusFilter = 'all' | 'processing' | 'completed';

const TYPE_FILTERS: Array<{ id: OrderTypeFilter; label: string; requiresData?: boolean }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'CARD', label: 'Mua thẻ' },
  { id: 'TOPUP', label: 'Nạp cước' },
  { id: 'DATA', label: 'Nạp Data', requiresData: true },
];

const STATUS_FILTERS: Array<{ id: OrderStatusFilter; label: string }> = [
  { id: 'all', label: 'Mọi trạng thái' },
  { id: 'processing', label: 'Đang xử lý' },
  { id: 'completed', label: 'Hoàn thành' },
];

function orderProductSummary(order: AccountOrder): string {
  if (!order.items?.length) return '—';
  return order.items
    .map((item) => {
      const qty = item.quantity > 1 ? ` ×${item.quantity}` : '';
      return `${item.productName}${qty}`;
    })
    .join(', ');
}

function orderMatchesType(order: AccountOrder, type: OrderTypeFilter): boolean {
  if (type === 'all') return true;
  return order.items?.some((i) => i.variantType === type) ?? false;
}

function hasCards(order: AccountOrder): boolean {
  return order.items?.some((i) => i.variantType === 'CARD') ?? false;
}

const LIST_PAGE_SIZES = [10, 50, 100] as const;

export default function AccountOrdersPage() {
  const siteConfig = useSiteConfig();
  const [take, setTake] = useState<number>(LIST_PAGE_SIZES[0]);
  const [typeFilter, setTypeFilter] = useState<OrderTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [expandMode, setExpandMode] = useState<'detail' | 'cards' | null>(null);

  const visibleFilters = useMemo(
    () =>
      TYPE_FILTERS.filter(
        (item) => !item.requiresData || isDataServiceVisible(siteConfig),
      ),
    [siteConfig],
  );

  useEffect(() => {
    setLoading(true);
    void accountApi
      .listOrders(
        statusFilter,
        typeFilter === 'all' ? undefined : typeFilter,
        skip,
        take,
      )
      .then((result) => {
        setOrders(result.items);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, [typeFilter, statusFilter, skip, take]);

  useEffect(() => {
    if (typeFilter === 'DATA' && !isDataServiceVisible(siteConfig)) {
      setTypeFilter('all');
      setSkip(0);
    }
  }, [typeFilter, siteConfig]);

  const filteredOrders = useMemo(
    () => orders.filter((o) => orderMatchesType(o, typeFilter)),
    [orders, typeFilter],
  );

  function toggleExpand(orderId: string, mode: 'detail' | 'cards') {
    if (expandedOrderId === orderId && expandMode === mode) {
      setExpandedOrderId(null);
      setExpandMode(null);
      return;
    }
    setExpandedOrderId(orderId);
    setExpandMode(mode);
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Lịch sử giao dịch</h2>
      <p className="mt-1 text-sm text-cardon-gray">Theo dõi trạng thái và nhận thẻ an toàn</p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {visibleFilters.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTypeFilter(item.id);
                setSkip(0);
                setExpandedOrderId(null);
                setExpandMode(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold',
                typeFilter === item.id
                  ? 'bg-cardon-blue text-white'
                  : 'bg-cardon-light text-cardon-gray hover:bg-gray-200',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setStatusFilter(item.id);
                setSkip(0);
                setExpandedOrderId(null);
                setExpandMode(null);
              }}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold',
                statusFilter === item.id
                  ? 'bg-cardon-navy text-white'
                  : 'border border-cardon-border bg-white text-cardon-gray hover:bg-cardon-light',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-cardon-gray">Đang tải...</p>
      ) : filteredOrders.length === 0 ? (
        <p className="mt-6 text-cardon-gray">Chưa có giao dịch nào.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredOrders.map((o) => (
            <div key={o.id} className="rounded-xl border border-cardon-border p-4 text-sm shadow-card">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-cardon-navy">{o.orderCode}</p>
                <span className="font-bold text-cardon-navy">{formatVnd(String(o.totalAmount))}</span>
              </div>
              <p className="mt-2 text-cardon-navy">{orderProductSummary(o)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge tone="blue">{paymentStatusLabelVi(o.paymentStatus)}</StatusBadge>
                <StatusBadge tone="gray">{resolveCustomerOrderStatusLabel(o)}</StatusBadge>
              </div>
              <p className="mt-2 text-xs text-cardon-gray">
                {new Date(o.createdAt).toLocaleString('vi-VN')}
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  type="button"
                  onClick={() => toggleExpand(o.id, 'detail')}
                  className="text-xs font-semibold text-cardon-blue hover:underline"
                >
                  {expandedOrderId === o.id && expandMode === 'detail' ? 'Ẩn chi tiết' : 'Chi tiết'}
                </button>
                {hasCards(o) && o.paymentStatus === 'PAID' && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(o.id, 'cards')}
                    className="text-xs font-semibold text-cardon-blue hover:underline"
                  >
                    {expandedOrderId === o.id && expandMode === 'cards' ? 'Ẩn thẻ' : 'Xem thẻ'}
                  </button>
                )}
              </div>
              {expandedOrderId === o.id && expandMode && (
                <AccountOrderExpanded orderId={o.id} mode={expandMode} />
              )}
            </div>
          ))}
        </div>
      )}

      <ListPagination
        skip={skip}
        take={take}
        total={total}
        onPageChange={(nextSkip) => {
          setSkip(nextSkip);
          setExpandedOrderId(null);
          setExpandMode(null);
        }}
        onPageSizeChange={setTake}
        pageSizeOptions={LIST_PAGE_SIZES}
        itemLabel="đơn"
      />
    </div>
  );
}

function StatusBadge({ children, tone }: { children: React.ReactNode; tone: 'blue' | 'gray' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'blue' ? 'bg-blue-50 text-cardon-blue' : 'bg-cardon-light text-cardon-gray',
      )}
    >
      {children}
    </span>
  );
}
