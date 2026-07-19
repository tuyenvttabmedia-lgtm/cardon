import { Badge } from '@/components/ui/Badge';
import {
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
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">Mã đơn hàng</p>
          <p className="text-xl font-bold text-gray-900">{order.orderCode}</p>
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
          <dt className="text-gray-500">Tổng tiền</dt>
          <dd className="font-semibold">{order.totalAmount} VND</dd>
        </div>
        <div>
          <dt className="text-gray-500">Ngày tạo</dt>
          <dd>{new Date(order.createdAt).toLocaleString('vi-VN')}</dd>
        </div>
        {order.guestEmail && (
          <div>
            <dt className="text-gray-500">Email</dt>
            <dd>{order.guestEmail}</dd>
          </div>
        )}
      </dl>
      <ul className="mt-6 divide-y divide-gray-100 rounded-xl border border-gray-100">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between px-4 py-3 text-sm">
            <span>
              {item.variant?.name ?? 'Sản phẩm'} × {item.quantity}
            </span>
            <span className="font-medium">{item.totalAmount} VND</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
