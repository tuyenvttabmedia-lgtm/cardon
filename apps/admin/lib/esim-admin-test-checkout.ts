import type { EsimOpsListItem, PaymentCheckoutView } from '@/types/api';

export const ADMIN_TEST_USD_DEFAULT = '1.00';
const USD_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export type AdminTestPayMethod = 'VIETQR' | 'PAYPAL';

export function canUseAdminTest(
  role: string | undefined,
  can: (permission: string) => boolean,
): boolean {
  return role === 'SUPER_ADMIN' && can('orders.manage');
}

/** Canonical USD string, or null when the typed value is not a sandbox charge. */
export function parseAdminTestUsd(value: string): string | null {
  const trimmed = value.trim();
  if (!USD_PATTERN.test(trimmed)) return null;
  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount < 0.01 || amount > 80) return null;
  return amount.toFixed(2);
}

export function adminTestOrderPayload(input: {
  variantId: string;
  method: AdminTestPayMethod;
  testAmountUsd: string;
}): {
  variantId: string;
  paymentMethodCode: 'VIETQR' | 'PAYPAL';
  market: 'VN' | 'INTL';
  testAmountUsd?: string;
} {
  if (input.method === 'VIETQR') {
    return {
      variantId: input.variantId,
      paymentMethodCode: 'VIETQR',
      market: 'VN',
    };
  }
  const testAmountUsd = parseAdminTestUsd(input.testAmountUsd);
  if (!testAmountUsd) {
    throw new Error('Số tiền thanh toán thử nghiệm USD không hợp lệ');
  }
  return {
    variantId: input.variantId,
    paymentMethodCode: 'PAYPAL',
    market: 'INTL',
    testAmountUsd,
  };
}

export function isUnknownRequestFailure(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === 'number' && status >= 400) return false;
  }
  return err instanceof TypeError || (err instanceof Error && /fetch|network|timeout/i.test(err.message));
}

/**
 * Use the approval URL returned by POST /payments. Reject anything that is
 * not an https PayPal Sandbox host. Do not assemble a PayPal URL here.
 */
export function readPaypalApprovalUrl(payment: Pick<PaymentCheckoutView, 'paymentUrl' | 'checkoutUrl'>): {
  ok: true;
  url: string;
} | { ok: false; reason: 'missing' | 'not-sandbox' } {
  const raw = (payment.paymentUrl || payment.checkoutUrl || '').trim();
  if (!raw) return { ok: false, reason: 'missing' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'not-sandbox' };
  }
  const host = url.hostname.toLowerCase();
  const sandbox = host === 'www.sandbox.paypal.com' || host === 'sandbox.paypal.com';
  if (url.protocol !== 'https:' || !sandbox) return { ok: false, reason: 'not-sandbox' };
  return { ok: true, url: raw };
}

export function matchRecoveredAdminTestOrder(
  items: EsimOpsListItem[],
  variant: { name: string; sku: string },
  method: AdminTestPayMethod,
): EsimOpsListItem | null {
  const wanted = method === 'PAYPAL' ? 'PAYPAL' : 'VIETQR';
  const candidates = items.filter((item) => {
    const paymentMethod = (item.paymentMethod ?? '').toUpperCase();
    const sameMethod = paymentMethod.includes(wanted);
    const samePackage = item.packageTitle === variant.name || item.providerProductCode === variant.sku;
    const waiting = item.paymentStatus === 'WAITING_PAYMENT';
    return sameMethod && samePackage && waiting && item.lane !== 'commerce';
  });
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0] ?? null;
}
