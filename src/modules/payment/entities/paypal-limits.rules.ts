/**
 * PayPal eSIM anti-abuse limits (USD). Tunable via settings later.
 * Does not apply to MegaPay / SePay / cards / topup.
 */

export interface PaypalEsimLimitConfig {
  maxQuantityPerOrder: number;
  maxUsdPerOrder: number;
  maxOrdersPerAccountPerDay: number;
  maxUsdPerAccountPerDay: number;
  newAccountMaxUsdPerOrder: number;
  newAccountMaxAgeHours: number;
}

export const DEFAULT_PAYPAL_ESIM_LIMITS: PaypalEsimLimitConfig = {
  maxQuantityPerOrder: 1,
  maxUsdPerOrder: 80,
  maxOrdersPerAccountPerDay: 3,
  maxUsdPerAccountPerDay: 150,
  newAccountMaxUsdPerOrder: 30,
  newAccountMaxAgeHours: 48,
};

export interface PaypalEsimLimitInput {
  quantity: number;
  amountUsd: number;
  ordersPaidToday: number;
  usdPaidToday: number;
  accountAgeHours: number | null;
  config?: Partial<PaypalEsimLimitConfig>;
}

export type PaypalEsimLimitResult =
  | { ok: true }
  | { ok: false; reason: string };

export function evaluatePaypalEsimLimits(input: PaypalEsimLimitInput): PaypalEsimLimitResult {
  const config = { ...DEFAULT_PAYPAL_ESIM_LIMITS, ...input.config };
  const quantity = Number(input.quantity);
  const amount = Number(input.amountUsd);

  if (!Number.isFinite(quantity) || quantity < 1) {
    return { ok: false, reason: 'INVALID_QUANTITY' };
  }
  if (quantity > config.maxQuantityPerOrder) {
    return { ok: false, reason: 'QUANTITY_EXCEEDED' };
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: 'INVALID_AMOUNT' };
  }

  const isNew =
    input.accountAgeHours == null || input.accountAgeHours < config.newAccountMaxAgeHours;
  const orderCap = isNew ? config.newAccountMaxUsdPerOrder : config.maxUsdPerOrder;
  if (amount > orderCap) {
    return { ok: false, reason: isNew ? 'NEW_ACCOUNT_ORDER_CAP' : 'ORDER_CAP' };
  }
  if (input.ordersPaidToday + 1 > config.maxOrdersPerAccountPerDay) {
    return { ok: false, reason: 'DAILY_ORDER_COUNT' };
  }
  if (input.usdPaidToday + amount > config.maxUsdPerAccountPerDay) {
    return { ok: false, reason: 'DAILY_USD_CAP' };
  }
  return { ok: true };
}
