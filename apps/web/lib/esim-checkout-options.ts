import { formatLocaleVnd } from '@/lib/i18n/locale';

export interface EsimQuotedOption {
  gateway: 'SEPAY' | 'PAYPAL';
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

/** Keep quote options that still have an enabled public method with the same gateway. */
export function filterEsimQuotedOptions<T extends { gateway: string }, M extends { enabled: boolean; gatewayCode: string }>(
  options: T[],
  methods: M[],
  methodsReady: boolean,
): T[] {
  if (!methodsReady) return [];
  return options.filter((option) =>
    methods.some((method) => method.enabled && method.gatewayCode === option.gateway),
  );
}

export function esimBuyerMarket(quote: Pick<EsimQuoteView, 'buyerMarket' | 'market'> | null | undefined): 'VN' | 'INTL' {
  return quote?.buyerMarket ?? quote?.market ?? 'VN';
}

/** Snapshot market follows the chosen gateway, not the page language. */
export function esimMarketForGateway(gateway: 'SEPAY' | 'PAYPAL'): 'VN' | 'INTL' {
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
