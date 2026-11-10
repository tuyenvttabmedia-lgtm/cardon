'use client';

import Link from 'next/link';
import { Badge, statusTone } from '@/components/ui/Display';
import { Button } from '@/components/ui/Form';
import { Table, TBody, TD, TH, THead, TR, TableEmpty } from '@/components/ui/Table';
import { vi } from '@/lib/i18n/vi';
import { formatDateTime, formatVnd } from '@/lib/utils';
import type { AdminCustomerDetail } from '@/types/api';

export function CustomerOrdersTab({
  detail,
  onPageChange,
  onTakeChange,
}: {
  detail: AdminCustomerDetail;
  onPageChange: (nextSkip: number) => void;
  onTakeChange: (take: number) => void;
}) {
  const { orders, ordersTotal, orderSkip, orderTake, profile } = detail;
  const page = Math.floor(orderSkip / orderTake) + 1;
  const pages = Math.max(1, Math.ceil(ordersTotal / orderTake));

  return (
    <div className="space-y-3">
      <Table>
        <THead>
          <TR>
            <TH>{vi.customers.orderCode}</TH>
            <TH>{vi.customers.orderTime}</TH>
            <TH>{vi.customers.orderProduct}</TH>
            <TH>{vi.customers.orderAmount}</TH>
            <TH>{vi.customers.orderPayment}</TH>
            <TH>{vi.customers.orderFulfillment}</TH>
          </TR>
        </THead>
        <TBody>
          {orders.length === 0 ? (
            <TableEmpty colSpan={6} message="Chưa có đơn hàng." />
          ) : (
            orders.map((order) => (
              <TR key={order.id}>
                <TD>
                  <Link
                    href={`/orders/${order.id}`}
                    className="font-medium text-admin-600 hover:underline"
                  >
                    {order.orderCode}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-slate-600">
                  {formatDateTime(order.createdAt)}
                </TD>
                <TD className="max-w-[14rem] text-slate-700">
                  <span className="block truncate" title={order.productSummary ?? undefined}>
                    {order.productSummary ?? '—'}
                  </span>
                </TD>
                <TD className="whitespace-nowrap">{formatVnd(String(order.totalAmount))}</TD>
                <TD>
                  <Badge tone={statusTone(order.paymentStatus)} status={order.paymentStatus} />
                </TD>
                <TD>
                  <Badge
                    tone={statusTone(order.fulfillmentStatus)}
                    status={order.fulfillmentStatus}
                  />
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>

      {ordersTotal > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-sm">
          <label className="inline-flex items-center gap-2 text-slate-600">
            <span>{vi.customers.ordersPerPage}</span>
            <select
              value={orderTake}
              onChange={(e) => onTakeChange(Number(e.target.value))}
              className="rounded border border-slate-200 px-2 py-1"
            >
              {[10, 20, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={orderSkip === 0}
              onClick={() => onPageChange(Math.max(0, orderSkip - orderTake))}
            >
              {vi.customers.prevPage}
            </Button>
            <span className="text-slate-600">
              {vi.customers.pageOf} {page}/{pages} ({ordersTotal})
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={orderSkip + orderTake >= ordersTotal}
              onClick={() => onPageChange(orderSkip + orderTake)}
            >
              {vi.customers.nextPage}
            </Button>
          </div>
        </div>
      ) : null}

      {profile.email ? (
        <Link
          href={`/orders?q=${encodeURIComponent(profile.email)}`}
          className="inline-block text-sm text-admin-600 hover:underline"
        >
          {vi.customers.viewAllOrders}
        </Link>
      ) : null}
    </div>
  );
}
