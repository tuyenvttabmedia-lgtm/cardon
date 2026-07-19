'use client';

import { useEffect, useState } from 'react';
import { OrderDeliveryContent } from '@/components/order/OrderDeliveryContent';
import { orderApi } from '@/services/api-client';
import type { OrderDeliveryResponse } from '@/types/api';

export function AccountOrderExpanded({
  orderId,
  mode,
}: {
  orderId: string;
  mode: 'detail' | 'cards';
}) {
  const [delivery, setDelivery] = useState<OrderDeliveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void orderApi
      .getDelivery(orderId)
      .then((data) => {
        if (active) {
          setDelivery(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không tải được đơn hàng');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  if (loading) {
    return <p className="mt-3 text-sm text-cardon-gray">Đang tải chi tiết...</p>;
  }

  if (error) {
    return <p className="mt-3 text-sm text-red-600">{error}</p>;
  }

  if (!delivery) return null;

  return (
    <div className="mt-4 rounded-xl border border-cardon-border bg-cardon-light/40 p-4">
      <OrderDeliveryContent
        delivery={delivery}
        orderId={orderId}
        showCardsOnly={mode === 'cards'}
      />
    </div>
  );
}
