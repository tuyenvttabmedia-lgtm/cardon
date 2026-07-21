import { Badge } from '@/components/ui/Badge';
import {
  formatVnd,
  paymentStatusLabel,
} from '@/lib/utils';
import { resolveCustomerOrderStatusLabel } from '@/lib/order-labels';
import type { Order } from '@/types/api';

function statusTone(status: string): 'default' | 'success' | 'warning' | 'danger' {
  if (status === 'PAID' || status === 'COMPLETED' || status === 'SUCCESS') return 'success';
  if (status === 'WAITING_PAYMENT' || status === 'PROCESSING' || status === 'PENDING') {
    return 'warning';
  }
  if (status === 'FAILED' || status === 'EXPIRED') return 'danger';
  return 'default';
}

export function OrderStatusPanel({ order }: { order: Order }) {
  const customerLabel = resolveCustomerOrderStatusLabel(order);

  return (
    <div className="rounded-2xl border border-cardon-border bg-white p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-cardon-gray">Mã đơn hàng</p>
          <p className="text-xl font-bold text-cardon-navy">{order.orderCode}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(order.customerStatus ?? order.paymentStatus)}>
            {customerLabel}
          </Badge>
          <Badge tone={statusTone(order.paymentStatus)}>
            {paymentStatusLabel(order.paymentStatus)}
          </Badge>
        </div>
      </div>
      <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-cardon-gray">Tổng tiền</dt>
          <dd className="font-semibold text-cardon-navy">{formatVnd(order.totalAmount)}</dd>
        </div>
        <div>
          <dt className="text-cardon-gray">Ngày tạo</dt>
          <dd className="text-cardon-navy">{new Date(order.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        {order.guestEmail && (
          <div>
            <dt className="text-cardon-gray">Email</dt>
            <dd className="text-cardon-navy">{order.guestEmail}</dd>
          </div>
        )}
      </dl>
      <ul className="mt-6 divide-y divide-cardon-border rounded-xl border border-cardon-border">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between px-4 py-3 text-sm">
            <span className="text-cardon-navy">
              {item.variant?.name ?? 'Sản phẩm'} × {item.quantity}
            </span>
            <span className="font-medium text-cardon-navy">{formatVnd(item.totalAmount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
