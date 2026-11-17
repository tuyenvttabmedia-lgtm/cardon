import { formatLocaleVnd } from '@/lib/i18n/locale';

export interface EsimQuotedOption {
  gateway: 'SEPAY' | 'MEGAPAY' | 'PAYPAL';
  methodCode: string;
  currency: 'VND' | 'USD';
  amount: string;
  referenceCurrency: 'VND';
  referenceAmount: string;
  fxRate: string | null;
  fxRateId: string | null;
  fxAsOf: string | null;
}

export interface EsimQuoteView {
  /** Buyer location from cf-ipcountry. Not the plan destination. */
  market: 'VN' | 'INTL';
  buyerMarket?: 'VN' | 'INTL';
  catalogCurrency: string;
  catalogAmount: string;
  chargeCurrency: string | null;
  chargeAmount: string | null;
  fxRate: string | null;
  fxRateId: string | null;
  fxAsOf: string | null;
  paymentOptions: EsimQuotedOption[];
  unavailableReason: string | null;
}

export function esimOptionKey(option: Pick<EsimQuotedOption, 'gateway' | 'methodCode'>): string {
  return `${option.gateway}:${option.methodCode}`;
}

/** Keep quote options that still have an armed public method for the same gateway/method. */
export function filterEsimQuotedOptions<
  T extends { gateway: string; methodCode?: string },
  M extends { enabled: boolean; gatewayCode: string; methodCode?: string; esimEnabled?: boolean },
>(options: T[], methods: M[], methodsReady: boolean): T[] {
  if (!methodsReady) return [];
  return options.filter((option) =>
    methods.some((method) => {
      if (method.gatewayCode !== option.gateway) return false;
      if (option.gateway === 'MEGAPAY' || option.gateway === 'SEPAY') {
        if (method.esimEnabled !== true) return false;
        if (option.methodCode && method.methodCode) {
          return method.methodCode.toUpperCase() === option.methodCode.toUpperCase();
        }
        return true;
      }
      return method.enabled === true;
    }),
  );
}

export function esimBuyerMarket(quote: Pick<EsimQuoteView, 'buyerMarket' | 'market'> | null | undefined): 'VN' | 'INTL' {
  return quote?.buyerMarket ?? quote?.market ?? 'VN';
}

/** Snapshot market follows the chosen gateway, not the page language. */
export function esimMarketForGateway(gateway: 'SEPAY' | 'MEGAPAY' | 'PAYPAL'): 'VN' | 'INTL' {
  return gateway === 'PAYPAL' ? 'INTL' : 'VN';
}

/** Order body. Amount, currency and FX stay on the server. */
export function esimOrderCreateBody(input: {
  variantId: string;
  paymentMethodCode: string;
  market: 'VN' | 'INTL';
  locale: 'vi' | 'en';
}) {
  return {
    items: [{ variantId: input.variantId, quantity: 1 }],
    paymentMethodCode: input.paymentMethodCode,
    market: input.market,
    locale: input.locale,
  };
}

export function esimPayLabel(locale: 'vi' | 'en', option: Pick<EsimQuotedOption, 'currency' | 'amount'>): string {
  if (option.currency === 'USD') {
    const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(option.amount));
    return locale === 'en' ? `Pay ${amount} USD` : `Thanh toán ${amount} USD`;
  }
  const amount = locale === 'en'
    ? new Intl.NumberFormat('en-US').format(Number(option.amount))
    : new Intl.NumberFormat('vi-VN').format(Number(option.amount));
  return locale === 'en' ? `Pay ${amount} VND` : `Thanh toán ${amount} ₫`;
}

/** Display name for a quoted option — only used when that option is actually armed. */
export function esimOptionDisplayName(
  locale: 'vi' | 'en',
  option: Pick<EsimQuotedOption, 'gateway' | 'methodCode'>,
): string {
  const code = option.methodCode.trim().toUpperCase();
  if (option.gateway === 'PAYPAL' || code === 'PAYPAL') {
    return locale === 'en' ? 'PayPal (USD)' : 'PayPal (USD)';
  }
  if (option.gateway === 'MEGAPAY' && code === 'ZALOPAY') return 'ZaloPay';
  if (option.gateway === 'MEGAPAY' && code === 'VNPAYQR') return 'VNPay QR';
  if (option.gateway === 'MEGAPAY' && code === 'DEPOSIT_CODE') {
    return locale === 'en' ? 'Bank transfer (VietQR)' : 'VietQR';
  }
  if (option.gateway === 'SEPAY') {
    return locale === 'en' ? 'Bank transfer (VietQR)' : 'VietQR';
  }
  return code;
}

function joinMethodNames(locale: 'vi' | 'en', names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) {
    return locale === 'en' ? `${names[0]} or ${names[1]}` : `${names[0]} hoặc ${names[1]}`;
  }
  const head = names.slice(0, -1).join(', ');
  const last = names[names.length - 1]!;
  return locale === 'en' ? `${head}, or ${last}` : `${head} hoặc ${last}`;
}

/**
 * Hint under the method list — only names methods present in `options` (already filtered by toggles).
 */
export function esimPaymentMethodsHint(
  locale: 'vi' | 'en',
  market: 'VN' | 'INTL',
  options: ReadonlyArray<Pick<EsimQuotedOption, 'gateway' | 'methodCode' | 'currency'>>,
): string | null {
  if (options.length === 0) return null;
  const names: string[] = [];
  const seen = new Set<string>();
  for (const option of options) {
    const name = esimOptionDisplayName(locale, option);
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  const list = joinMethodNames(locale, names);
  const hasVnd = options.some((o) => o.currency === 'VND');
  const hasUsd = options.some((o) => o.currency === 'USD');
  if (market === 'INTL') {
    if (locale === 'en') {
      if (names.length === 1 && hasUsd && !hasVnd) {
        return `Paying from outside Vietnam: ${list}.`;
      }
      return `Paying from outside Vietnam: ${list}. Choose one method below.`;
    }
    if (names.length === 1 && hasUsd && !hasVnd) {
      return `Thanh toán từ nước ngoài: ${list}.`;
    }
    return `Thanh toán từ nước ngoài: ${list}. Chọn một phương thức bên dưới.`;
  }
  if (locale === 'en') {
    return `Paying from Vietnam: ${list}. Choose one method below. The eSIM plan country does not change available payment methods.`;
  }
  return `Thanh toán tại Việt Nam: ${list}. Chọn một phương thức bên dưới. Quốc gia gói eSIM không ảnh hưởng cổng thanh toán.`;
}

export function esimReferenceNote(
  locale: 'vi' | 'en',
  option: Pick<EsimQuotedOption, 'currency' | 'referenceAmount' | 'fxRate'>,
): string | null {
  if (option.currency !== 'USD' || !option.fxRate) return null;
  const reference = locale === 'en'
    ? new Intl.NumberFormat('en-US').format(Number(option.referenceAmount))
    : new Intl.NumberFormat('vi-VN').format(Number(option.referenceAmount));
  const rate = locale === 'en'
    ? new Intl.NumberFormat('en-US').format(Number(option.fxRate))
    : new Intl.NumberFormat('vi-VN').format(Number(option.fxRate));
  return locale === 'en'
    ? `Reference price ${reference} VND · Exchange rate 1 USD = ${rate} VND`
    : `Giá tham khảo ${reference} ₫ · Tỷ giá 1 USD = ${rate} VND`;
}

/** English shelves show the server USD charge. Vietnamese shelves stay on the VND catalog price. */
export function esimShelfPrice(
  locale: 'vi' | 'en',
  offer: { sellPriceVnd: number; chargeCurrency?: string | null; chargeAmount?: string | null },
): string {
  if (locale === 'en' && offer.chargeCurrency === 'USD' && offer.chargeAmount) {
    const amount = Number(offer.chargeAmount);
    if (Number.isFinite(amount) && amount > 0) {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
    }
  }
  return formatLocaleVnd(offer.sellPriceVnd, locale);
}
