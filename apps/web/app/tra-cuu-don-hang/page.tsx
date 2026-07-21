'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageContainer } from '@/components/layout/PageContainer';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ApiClientError, orderApi } from '@/services/api-client';
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
    setResult(null);
    try {
      const data = await orderApi.lookupDelivery(orderCode.trim(), email.trim());
      setResult(data);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(
          err.status === 404
            ? 'Không tìm thấy đơn hàng. Kiểm tra lại mã đơn và email đã dùng khi mua.'
            : err.message,
        );
      } else {
        setError(err instanceof Error ? err.message : 'Không tra cứu được đơn hàng');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer className="page-footer-gap">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-sm text-cardon-gray">
            <Link href="/" className="text-cardon-blue hover:underline">
              Trang chủ
            </Link>
            {' / '}
            Tra cứu đơn hàng
          </p>
          <h1 className="mt-2 text-2xl font-bold text-cardon-navy sm:text-3xl">
            Tra cứu đơn hàng
          </h1>
          <p className="mt-2 text-sm text-cardon-gray">
            Nhập mã đơn (dạng <span className="font-mono">ORD-…</span>) và email đã dùng khi mua
            hàng. Giới hạn 5 lần / 15 phút.
          </p>
        </div>

        <form
          onSubmit={handleLookup}
          className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6"
        >
          <label className="block text-sm font-medium text-cardon-navy">
            Mã đơn hàng
            <Input
              className="mt-1"
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="ORD-20260721-A1B2C3"
              autoComplete="off"
              required
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-cardon-navy">
            Email
            <Input
              className="mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              required
            />
          </label>
          <Button className="btn-checkout mt-5 w-full" type="submit" disabled={loading} size="lg">
            {loading ? 'Đang tra cứu...' : 'Tra cứu'}
          </Button>
          {error && (
            <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <p className="mt-4 text-sm text-cardon-gray">
            Đã có tài khoản?{' '}
            <Link href="/login" className="font-semibold text-cardon-blue hover:underline">
              Đăng nhập
            </Link>{' '}
            để xem lịch sử đơn trong tài khoản.
          </p>
        </form>

        {result && (
          <div className="rounded-2xl border border-cardon-border bg-white p-4 shadow-card sm:p-6">
            <OrderDeliveryContent
              delivery={result}
              orderId={result.order.id}
              guestEmail={email.trim()}
              backHref="/tra-cuu-don-hang"
              backLabel="← Tra cứu đơn khác"
            />
          </div>
        )}
      </div>
    </PageContainer>
  );
}
