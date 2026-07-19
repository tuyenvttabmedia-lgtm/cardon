'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiBaseUrl } from '@/lib/utils';
import {
  enabledMethods,
  findPaymentMethod,
  methodGateway,
  type PublicPaymentMethod,
} from '@/lib/payment-methods';
import { normalizeMethodCode } from '@/lib/payment-method-codes';
import type { PaymentGatewayCode } from '@/types/api';

export function usePaymentMethods() {
  const [methods, setMethods] = useState<PublicPaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethodCode, setPaymentMethodCode] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBaseUrl()}/payment-methods`, { cache: 'no-store' });
      if (!res.ok) {
        setError('Không tải được phương thức thanh toán');
        return;
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        setError('Không tải được phương thức thanh toán');
        return;
      }
      const payload = await res.json();
      const raw = (payload?.data ?? payload) as Array<Record<string, unknown>>;
      const list: PublicPaymentMethod[] = Array.isArray(raw)
        ? raw.map((item) => ({
            methodCode: String(item.methodCode ?? item.code ?? ''),
            displayName: String(item.displayName ?? item.name ?? item.methodCode ?? ''),
            description: String(item.description ?? ''),
            iconUrl: (item.iconUrl as string | null) ?? null,
            logoUrl: (item.logoUrl as string | null) ?? null,
            enabled: Boolean(item.enabled ?? true),
            percentageFee: Number(item.percentageFee ?? 0),
            fixedFee: Number(item.fixedFee ?? 0),
            gatewayCode: (item.gatewayCode ?? item.gateway ?? 'SEPAY') as PaymentGatewayCode,
          }))
        : [];
      setMethods(list.filter((m) => m.methodCode));
      const enabled = enabledMethods(list);
      setPaymentMethodCode((prev) => {
        const prevNorm = prev ? normalizeMethodCode(prev) : null;
        if (prevNorm && enabled.some((m) => m.methodCode === prevNorm)) return prevNorm;
        return enabled[0]?.methodCode ?? null;
      });
    } catch {
      setMethods([]);
      setPaymentMethodCode(null);
      setError('Không tải được phương thức thanh toán');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeMethods = enabledMethods(methods);
  const hasMethods = activeMethods.length > 0;

  const selectedMethod = useMemo(
    () => findPaymentMethod(activeMethods, paymentMethodCode),
    [activeMethods, paymentMethodCode],
  );

  const gateway: PaymentGatewayCode | null = selectedMethod
    ? methodGateway(selectedMethod)
    : null;

  const setGateway = useCallback(
    (nextGateway: PaymentGatewayCode) => {
      const match = activeMethods.find((m) => m.gatewayCode === nextGateway);
      if (match) setPaymentMethodCode(match.methodCode);
    },
    [activeMethods],
  );

  return {
    methods,
    activeMethods,
    paymentMethodCode,
    setPaymentMethodCode,
    selectedMethod,
    gateways: activeMethods.map((m) => m.gatewayCode),
    gateway,
    setGateway,
    loading,
    error,
    hasMethods,
    reload,
  };
}
