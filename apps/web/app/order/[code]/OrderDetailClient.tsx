'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ACCOUNT_PATHS } from '@/lib/account-routes';
import { resolveOrderGuestEmail, storeOrderGuestEmail } from '@/lib/order-guest-email';
import { useAuth } from '@/hooks/useAuth';
import { orderApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

function OrderDetailLoading() {
  return (
    <div className="page-shell page-footer-gap">
      <p className="text-center text-cardon-gray">Đang tải đơn hàng...</p>
    </div>
  );
}

export default function OrderDetailPageClient({ orderCode }: { orderCode: string }) {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get('payment');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [emailInput, setEmailInput] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    const resolved = resolveOrderGuestEmail(orderCode, searchParams.get('email'));
    setGuestEmail(resolved);
    setEmailInput(resolved);
  }, [orderCode, searchParams, authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated && !guestEmail) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    async function load() {
      try {
        let data: OrderDeliveryResponse | null = null;
        let resolvedOrderId: string | null = null;

        if (isAuthenticated) {
          const orders = await orderApi.list();
          const found = orders.find((o) => o.orderCode === orderCode);
          if (found) {
            resolvedOrderId = found.id;
            data = await orderApi.getDelivery(found.id);
          }
        } else {
          data = await orderApi.lookupDelivery(orderCode, guestEmail);
          resolvedOrderId = data.order.id;
        }

        if (active) {
          if (data) {
            setDelivery(data);
            setOrderId(resolvedOrderId);
            setError(null);
          } else {
            setError('Không tìm thấy đơn hàng');
          }
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không tải được đơn hàng');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    const timer = setInterval(() => void load(), 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderCode, isAuthenticated, guestEmail, authLoading]);

  if (authLoading) {
    return <OrderDetailLoading />;
  }

  if (!isAuthenticated && !guestEmail) {
    return (
      <div className="page-shell page-footer-gap">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-cardon-navy">Xác minh email</h1>
          <p className="mt-2 text-sm text-cardon-gray">
            Nhập email đã dùng khi mua hàng để xem đơn {orderCode}
          </p>
          {paymentStatus === 'success' && (
            <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">
              Thanh toán thành công. Nhập email để xem đơn và nhận mã thẻ.
            </p>
          )}
          <Input
            className="mt-4"
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="email@example.com"
          />
          <Button
            className="mt-4 w-full"
            onClick={() => {
              const email = emailInput.trim();
              storeOrderGuestEmail(orderCode, email);
              setGuestEmail(email);
            }}
          >
            Tiếp tục
          </Button>
        </div>
      </div>
    );
  }

  if (loading && !delivery) {
    return <OrderDetailLoading />;
  }

  if (error && !delivery) {
    return (
      <div className="page-shell page-footer-gap">
        <p className="text-center text-red-600">{error}</p>
      </div>
    );
  }

  if (!delivery || !orderId) {
    return null;
  }

  return (
    <div className="page-shell page-footer-gap">
      <OrderDeliveryContent
        delivery={delivery}
        orderId={orderId}
        paymentStatus={paymentStatus}
        guestEmail={!isAuthenticated ? guestEmail : undefined}
        backHref={isAuthenticated ? ACCOUNT_PATHS.orders : '/tra-cuu-don-hang'}
        backLabel={isAuthenticated ? '← Về lịch sử giao dịch' : '← Quay lại tra cứu'}
      />
    </div>
  );
}
