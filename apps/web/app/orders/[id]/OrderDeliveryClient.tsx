'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { accountReturnPath } from '@/lib/account-routes';
import { resolveOrderGuestEmail, storeOrderGuestEmail } from '@/lib/order-guest-email';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { useAuth } from '@/hooks/useAuth';
import { orderApi, paymentApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

function OrderDeliveryLoading() {
  const t = useT();
  return (
    <div className="page-shell page-footer-gap">
      <p className="text-center text-cardon-gray">{t('order.loading')}</p>
    </div>
  );
}

export default function OrderDeliveryClient({ orderId }: { orderId: string }) {
  const searchParams = useSearchParams();
  const paymentStatus = searchParams.get('payment');
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { locale } = useLocale();
  const [emailInput, setEmailInput] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [delivery, setDelivery] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingPayment, setSyncingPayment] = useState(false);

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    const resolved = resolveOrderGuestEmail(orderId, searchParams.get('email'));
    setGuestEmail(resolved);
    setEmailInput(resolved);
  }, [orderId, searchParams, authLoading, isAuthenticated]);

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
        const data = await orderApi.getDelivery(orderId);
        if (active) {
          setDelivery(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(customerFacingError(locale, err));
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
  }, [orderId, isAuthenticated, guestEmail, authLoading]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (paymentStatus !== 'success') return;
    let active = true;
    setSyncingPayment(true);
    void paymentApi
      .syncFromGateway(orderId)
      .then(async () => {
        if (!active) return;
        try {
          const data = await orderApi.getDelivery(orderId);
          if (active) {
            setDelivery(data);
            setError(null);
          }
        } catch {
          /* delivery poll continues */
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setSyncingPayment(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, isAuthenticated, authLoading, paymentStatus]);

  if (authLoading) {
    return <OrderDeliveryLoading />;
  }

  if (!isAuthenticated && !guestEmail) {
    return (
      <div className="page-shell page-footer-gap">
        <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-cardon-navy">Xác minh email</h1>
          <p className="mt-2 text-sm text-cardon-gray">
            Nhập email đã dùng khi mua hàng để xem đơn
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
              storeOrderGuestEmail(orderId, email);
              setGuestEmail(email);
            }}
          >
            Tiếp tục
          </Button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && guestEmail) {
    return <GuestOrderDelivery orderId={orderId} guestEmail={guestEmail} paymentStatus={paymentStatus} />;
  }

  if (loading && !delivery) {
    return <OrderDeliveryLoading />;
  }

  if (error && !delivery) {
    return (
      <div className="page-shell page-footer-gap">
        <p className="text-center text-red-600">{error}</p>
      </div>
    );
  }

  if (!delivery) {
    return null;
  }

  return (
    <OrderDeliveryView
      delivery={delivery}
      orderId={orderId}
      paymentStatus={paymentStatus}
      guestEmail={undefined}
      isAuthenticated={isAuthenticated}
      from={searchParams.get('from')}
      syncingPayment={syncingPayment}
    />
  );
}

function GuestOrderDelivery({
  orderId,
  guestEmail,
  paymentStatus,
}: {
  orderId: string;
  guestEmail: string;
  paymentStatus: string | null;
}) {
  const { locale } = useLocale();
  const [delivery, setDelivery] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await orderApi.getDelivery(orderId, guestEmail);
        if (active) {
          setDelivery(data);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(customerFacingError(locale, err));
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
  }, [orderId, guestEmail]);

  if (loading && !delivery) {
    return <OrderDeliveryLoading />;
  }

  if (error && !delivery) {
    return (
      <div className="page-shell page-footer-gap">
        <p className="text-center text-red-600">{error}</p>
      </div>
    );
  }

  if (!delivery) {
    return null;
  }

  return (
    <OrderDeliveryView
      delivery={delivery}
      orderId={orderId}
      paymentStatus={paymentStatus}
      guestEmail={guestEmail}
      isAuthenticated={false}
      from={null}
      syncingPayment={false}
    />
  );
}

function OrderDeliveryView({
  delivery,
  orderId,
  paymentStatus,
  guestEmail,
  isAuthenticated,
  from,
  syncingPayment,
}: {
  delivery: OrderDeliveryResponse;
  orderId: string;
  paymentStatus: string | null;
  guestEmail?: string;
  isAuthenticated: boolean;
  from: string | null;
  syncingPayment?: boolean;
}) {
  return (
    <div className="page-shell page-footer-gap">
      <OrderDeliveryContent
        delivery={delivery}
        orderId={orderId}
        paymentStatus={paymentStatus}
        guestEmail={guestEmail}
        backHref={isAuthenticated ? accountReturnPath(from) : '/tra-cuu-don-hang'}
        syncingPayment={syncingPayment}
      />
    </div>
  );
}
