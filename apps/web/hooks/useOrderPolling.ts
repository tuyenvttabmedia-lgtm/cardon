'use client';

import { useEffect, useState } from 'react';
import { orderApi } from '@/services/api-client';
import type { Order } from '@/types/api';

export function useOrderPolling(
  orderCode: string | null,
  email: string | null,
  enabled = true,
  intervalMs = 5000,
) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !orderCode || !email) return;

    let active = true;

    const poll = async () => {
      try {
        const data = await orderApi.lookup(orderCode, email);
        if (active) {
          setOrder(data.order);
          setError(null);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Không tải được đơn hàng');
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderCode, email, enabled, intervalMs]);

  return { order, error };
}
