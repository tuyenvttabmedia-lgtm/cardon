import type { PublicPaymentMethod } from '@/lib/payment-methods';

/**
 * Card/topup never lists PayPal.
 * eSIM methods come from the server quote (buyer location), not this helper.
 * When still used for eSIM: Vietnam may see SePay, MegaPay (esimEnabled), and PayPal;
 * a foreign buyer sees PayPal only.
 */
export function paymentMethodsForCheckout<
  T extends { gatewayCode: string; enabled: boolean; esimEnabled?: boolean },
>(input: {
  methods: T[];
  isEsim: boolean;
  market: 'VN' | 'INTL';
}): T[] {
  if (!input.isEsim) {
    return input.methods.filter((method) => method.enabled && method.gatewayCode !== 'PAYPAL');
  }
  if (input.market === 'INTL') {
    return input.methods.filter((method) => method.enabled && method.gatewayCode === 'PAYPAL');
  }
  return input.methods.filter((method) => {
    if (method.gatewayCode === 'SEPAY' || method.gatewayCode === 'PAYPAL') return method.enabled;
    if (method.gatewayCode === 'MEGAPAY') return method.esimEnabled === true;
    return false;
  });
}

export type PaypalReturnView = 'confirmed' | 'pending' | 'failed' | 'unconfirmed' | 'cancelled';

/**
 * Backend status is the only success signal. PayPal return query params are ignored.
 * A cancel landing still syncs; only SUCCESS upgrades away from cancelled.
 */
export function paypalReturnPresentation(input: {
  backendStatus?: string | null;
  cancelled?: boolean;
}): PaypalReturnView {
  if (input.backendStatus === 'SUCCESS') return 'confirmed';
  if (input.backendStatus === 'FAILED' || input.backendStatus === 'EXPIRED') return 'failed';
  if (input.cancelled) return 'cancelled';
  if (input.backendStatus === 'PENDING') return 'pending';
  return 'unconfirmed';
}

export function paypalReturnCopyKey(
  view: PaypalReturnView,
):
  | 'paypal.confirmed'
  | 'paypal.pending'
  | 'paypal.failed'
  | 'paypal.unconfirmed'
  | 'paypal.cancelled' {
  if (view === 'confirmed') return 'paypal.confirmed';
  if (view === 'pending') return 'paypal.pending';
  if (view === 'failed') return 'paypal.failed';
  if (view === 'cancelled') return 'paypal.cancelled';
  return 'paypal.unconfirmed';
}

export function isPaypalApprovalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('paypal.com');
  } catch {
    return false;
  }
}

export type { PublicPaymentMethod };
