/**
 * Phase A — per-order eSIM charge ceilings (VND / USD).
 * Independent from retail guestMaxOrderAmount / customerMaxOrderAmount.
 */

import {
  DEFAULT_PAYPAL_ESIM_LIMITS,
  evaluatePaypalEsimLimits,
} from '../payment/entities/paypal-limits.rules';

export const ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT = 2_000_000;
export const ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT = 80;
export const ESIM_MAX_CHARGE_AMOUNT_VND_HARD_MAX = 500_000_000;
/** Absolute PayPal eSIM USD ceiling — Admin cannot raise above this. */
export const ESIM_MAX_CHARGE_AMOUNT_USD_HARD_MAX = DEFAULT_PAYPAL_ESIM_LIMITS.maxUsdPerOrder;

export const ESIM_ORDER_AMOUNT_LIMIT_MESSAGE =
  'Đơn vượt giới hạn thanh toán eSIM. Vui lòng chọn gói có giá trị thấp hơn hoặc liên hệ bộ phận hỗ trợ.';

/** Coerce stored setting. Invalid/missing → default (never treat as 0 / unlimited). Explicit 0 stays 0 (disabled). */
export function resolveEsimMaxChargeSetting(
  raw: unknown,
  defaults: { defaultValue: number; hardMax: number },
): number {
  if (raw === null || raw === undefined || raw === '') {
    return defaults.defaultValue;
  }
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    return defaults.defaultValue;
  }
  if (value === 0) {
    return 0;
  }
  if (value > defaults.hardMax) {
    return defaults.defaultValue;
  }
  return value;
}

export function resolveEsimChargeLimitConfig(input: {
  esimMaxChargeAmountVnd?: unknown;
  esimMaxChargeAmountUsd?: unknown;
}): { maxVnd: number; maxUsd: number } {
  return {
    maxVnd: resolveEsimMaxChargeSetting(input.esimMaxChargeAmountVnd, {
      defaultValue: ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
      hardMax: ESIM_MAX_CHARGE_AMOUNT_VND_HARD_MAX,
    }),
    maxUsd: resolveEsimMaxChargeSetting(input.esimMaxChargeAmountUsd, {
      defaultValue: ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT,
      hardMax: ESIM_MAX_CHARGE_AMOUNT_USD_HARD_MAX,
    }),
  };
}

/**
 * Absolute PayPal eSIM overall USD cap.
 * Admin may only lower the ceiling: overallCap = min(adminCap, 80) when admin > 0;
 * admin 0 / invalid → hard 80 still applies.
 */
export function resolvePaypalOverallUsdCap(maxUsdSetting: number): number {
  const hardCap = DEFAULT_PAYPAL_ESIM_LIMITS.maxUsdPerOrder;
  if (!Number.isFinite(maxUsdSetting) || maxUsdSetting <= 0) {
    return hardCap;
  }
  return Math.min(maxUsdSetting, hardCap);
}

/**
 * Hours since account creation. null = missing/invalid → treat as new (fail-closed).
 * Never trust client-supplied age.
 */
export function accountAgeHoursFromCreatedAt(
  createdAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (createdAt == null || createdAt === '') {
    return null;
  }
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.max(0, (now.getTime() - date.getTime()) / 3_600_000);
}

export type EsimChargeLimitCheckInput = {
  chargeAmount: number | string;
  chargeCurrency: string;
  maxVnd: number;
  maxUsd: number;
  /** PayPal path only — account age for new-account cap. null = treat as new (fail-closed). */
  accountAgeHours?: number | null;
  quantity?: number;
};

export type EsimChargeLimitOk = {
  ok: true;
  effectiveLimit: number | null;
};

export type EsimChargeLimitBlocked = {
  ok: false;
  reason: 'ESIM_ORDER_AMOUNT_LIMIT' | 'PAYPAL_ESIM_LIMIT';
  paypalReason?: string;
  chargeAmount: number;
  chargeCurrency: 'VND' | 'USD';
  configuredLimit: number | null;
  effectiveLimit: number | null;
};

export type EsimChargeLimitResult = EsimChargeLimitOk | EsimChargeLimitBlocked;

function parseAmount(raw: number | string): number | null {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Effective USD order cap:
 * overallCap = min(adminCap, 80) when admin > 0, else 80;
 * effectiveCap = min(overallCap, newAccount 30) when new.
 */
export function effectivePaypalUsdOrderCap(input: {
  maxUsdSetting: number;
  accountAgeHours: number | null | undefined;
}): { effectiveLimit: number; isNewAccount: boolean; adminLimit: number | null; overallCap: number } {
  const isNew =
    input.accountAgeHours == null ||
    input.accountAgeHours < DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxAgeHours;
  const overallCap = resolvePaypalOverallUsdCap(input.maxUsdSetting);
  const caps = [overallCap];
  if (isNew) {
    caps.push(DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxUsdPerOrder);
  }
  return {
    effectiveLimit: Math.min(...caps),
    isNewAccount: isNew,
    adminLimit: input.maxUsdSetting > 0 ? Math.min(input.maxUsdSetting, overallCap) : null,
    overallCap,
  };
}

export function evaluateEsimChargeLimit(input: EsimChargeLimitCheckInput): EsimChargeLimitResult {
  const amount = parseAmount(input.chargeAmount);
  const currency = String(input.chargeCurrency ?? '')
    .trim()
    .toUpperCase();

  if (amount == null) {
    return {
      ok: false,
      reason: 'ESIM_ORDER_AMOUNT_LIMIT',
      chargeAmount: Number(input.chargeAmount) || 0,
      chargeCurrency: currency === 'USD' ? 'USD' : 'VND',
      configuredLimit: null,
      effectiveLimit: null,
    };
  }

  if (currency === 'VND') {
    const configured = input.maxVnd;
    if (configured <= 0) {
      return { ok: true, effectiveLimit: null };
    }
    if (amount > configured) {
      return {
        ok: false,
        reason: 'ESIM_ORDER_AMOUNT_LIMIT',
        chargeAmount: amount,
        chargeCurrency: 'VND',
        configuredLimit: configured,
        effectiveLimit: configured,
      };
    }
    return { ok: true, effectiveLimit: configured };
  }

  if (currency === 'USD') {
    const { effectiveLimit, adminLimit, overallCap } = effectivePaypalUsdOrderCap({
      maxUsdSetting: input.maxUsd,
      accountAgeHours: input.accountAgeHours,
    });
    const paypal = evaluatePaypalEsimLimits({
      quantity: input.quantity ?? 1,
      amountUsd: amount,
      // Phase A: do not pretend daily counters are live. Pass zeros; do not rely on them for safety.
      ordersPaidToday: 0,
      usdPaidToday: 0,
      accountAgeHours: input.accountAgeHours ?? null,
      config: {
        maxUsdPerOrder: overallCap,
      },
    });
    if (!paypal.ok) {
      const isAmountCap =
        paypal.reason === 'ORDER_CAP' || paypal.reason === 'NEW_ACCOUNT_ORDER_CAP';
      return {
        ok: false,
        reason: isAmountCap ? 'ESIM_ORDER_AMOUNT_LIMIT' : 'PAYPAL_ESIM_LIMIT',
        paypalReason: paypal.reason,
        chargeAmount: amount,
        chargeCurrency: 'USD',
        configuredLimit: adminLimit,
        effectiveLimit,
      };
    }
    if (amount > effectiveLimit) {
      return {
        ok: false,
        reason: 'ESIM_ORDER_AMOUNT_LIMIT',
        chargeAmount: amount,
        chargeCurrency: 'USD',
        configuredLimit: adminLimit,
        effectiveLimit,
      };
    }
    return { ok: true, effectiveLimit };
  }

  return {
    ok: false,
    reason: 'ESIM_ORDER_AMOUNT_LIMIT',
    chargeAmount: amount,
    chargeCurrency: 'VND',
    configuredLimit: null,
    effectiveLimit: null,
  };
}
