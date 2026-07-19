'use client';

import { useState } from 'react';
import { CardDeliveryPanel } from '@/components/order/CardDeliveryPanel';
import { OrderStatusPanel } from '@/components/order/OrderStatusPanel';
import { OrderTimeline } from '@/components/order/OrderTimeline';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { orderApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

export default function GuestOrderLookupPage() {
  const [orderCode, setOrderCode] = useState('');
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await orderApi.lookupDelivery(orderCode.trim(), email.trim());
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Không tìm thấy đơn hàng');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold sm:text-3xl">Tra cứu đơn hàng</h1>
        <p className="mt-2 text-sm text-gray-600">
          Nhập mã đơn và email đã dùng khi mua hàng. Giới hạn 5 lần / 15 phút.
        </p>
      </div>

      <form
        onSubmit={handleLookup}
        className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6"
      >
        <label className="block text-sm font-medium text-gray-700">
          Mã đơn hàng
          <Input
            className="mt-1"
            value={orderCode}
            onChange={(e) => setOrderCode(e.target.value)}
            placeholder="CO12345678"
            required
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-gray-700">
          Email
          <Input
            className="mt-1"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
          />
        </label>
        <Button className="mt-4 w-full" type="submit" disabled={loading}>
          {loading ? 'Đang tra cứu...' : 'Tra cứu'}
        </Button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </form>

      {result && (
        <div className="space-y-6">
          <OrderStatusPanel order={result.order} />
          <OrderTimeline steps={result.timeline} />
          {result.delivery.hasCards && result.delivery.cards.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Thông tin giao thẻ</h2>
              <div className="mt-4">
                <CardDeliveryPanel
                  orderId={result.order.id}
                  cards={result.delivery.cards}
                  guestEmail={email.trim()}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
