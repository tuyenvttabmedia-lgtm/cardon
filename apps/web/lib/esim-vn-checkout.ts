import { isInlineQrPayment, isSepayPgCheckout, persistAndPathForQrPayment } from '@/lib/checkout-qr-flow';
import { readBrowserLocale } from '@/lib/i18n/locale';
import { enabledMethods, type PublicPaymentMethod } from '@/lib/payment-methods';
import { getApiBaseUrl, generateIdempotencyKey } from '@/lib/utils';
import { ApiClientError, orderApi, paymentApi } from '@/services/api-client';
import type { Payment, PaymentGatewayCode } from '@/types/api';

/** Vietnam eSIM lane: SePay only (legacy QR or Payment Gateway). Cards/topup MegaPay and PayPal INTL are out of scope. */
export function filterEsimVnPaymentMethods(methods: PublicPaymentMethod[]): PublicPaymentMethod[] {
  return enabledMethods(methods).filter((method) => method.gatewayCode === 'SEPAY');
}

export function preferEsimVnMethodCode(methods: PublicPaymentMethod[]): string | null {
  const sepay = filterEsimVnPaymentMethods(methods);
  if (sepay.length === 0) return null;
  const preferred = sepay.find((method) => {
    const code = method.methodCode.toUpperCase();
    return code.includes('QR') || code === 'BANK_QR' || code === 'VIETQR' || code === 'DEPOSIT_CODE';
  });
  return (preferred ?? sepay[0]).methodCode;
}

export async function fetchPublicPaymentMethods(): Promise<PublicPaymentMethod[]> {
  const res = await fetch(`${getApiBaseUrl()}/payment-methods`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Không tải được phương thức thanh toán');
  }
  const payload = await res.json();
  const raw = (payload?.data ?? payload) as Array<Record<string, unknown>>;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
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
    .filter((method) => method.methodCode);
}

export type EsimVnCheckoutResult =
  | { kind: 'qr'; path: string; orderId: string }
  | {
      kind: 'sepay_pg';
      orderId: string;
      checkoutUrl: string;
      checkoutFormFields: Record<string, string>;
    };

export function resolveEsimVnPayResult(
  pay: Payment,
  order: { id: string; orderCode: string; guestEmail?: string | null },
): EsimVnCheckoutResult {
  if (isSepayPgCheckout(pay) && pay.checkoutUrl && pay.checkoutFormFields) {
    return {
      kind: 'sepay_pg',
      orderId: order.id,
      checkoutUrl: pay.checkoutUrl,
      checkoutFormFields: pay.checkoutFormFields,
    };
  }
  if (!isInlineQrPayment(pay) || !pay.paymentUrl) {
    throw new Error('Không tạo được mã QR thanh toán. Thử lại hoặc liên hệ hỗ trợ.');
  }
  return {
    kind: 'qr',
    orderId: order.id,
    path: persistAndPathForQrPayment({
      orderId: order.id,
      orderCode: order.orderCode,
      email: order.guestEmail ?? '',
      payment: pay,
    }),
  };
}

/**
 * Logged-in VN eSIM: create order + SePay payment.
 * Returns QR waiting path or Payment Gateway form fields for auto-POST.
 */
export async function startEsimVnCheckout(
  variantId: string,
  options?: { salesOpen?: boolean },
): Promise<EsimVnCheckoutResult> {
  if (options?.salesOpen === false) {
    throw new Error('Chưa mở bán');
  }
  const methods = await fetchPublicPaymentMethods();
  const paymentMethodCode = preferEsimVnMethodCode(methods);
  if (!paymentMethodCode) {
    throw new Error('Thanh toán tạm thời chưa khả dụng. Thử lại sau hoặc liên hệ hỗ trợ.');
  }

  const order = await orderApi.create({
    items: [{ variantId, quantity: 1 }],
    paymentMethodCode,
    market: 'VN',
    locale: readBrowserLocale(),
  });

  const pay = await paymentApi.create(
    { orderId: order.id, gateway: 'SEPAY' },
    generateIdempotencyKey(),
  );

  return resolveEsimVnPayResult(pay, order);
}

export function esimCheckoutErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không tạo được thanh toán eSIM';
}
