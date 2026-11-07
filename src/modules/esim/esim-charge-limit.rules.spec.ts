import { DEFAULT_PAYPAL_ESIM_LIMITS } from '../payment/entities/paypal-limits.rules';
import {
  ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT,
  ESIM_MAX_CHARGE_AMOUNT_USD_HARD_MAX,
  ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
  accountAgeHoursFromCreatedAt,
  effectivePaypalUsdOrderCap,
  evaluateEsimChargeLimit,
  resolveEsimChargeLimitConfig,
  resolveEsimMaxChargeSetting,
  resolvePaypalOverallUsdCap,
} from './esim-charge-limit.rules';

describe('esim charge limit Phase A', () => {
  it('uses defaults when setting missing or invalid, keeps explicit 0 as off', () => {
    expect(
      resolveEsimMaxChargeSetting(undefined, {
        defaultValue: ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
        hardMax: 500_000_000,
      }),
    ).toBe(2_000_000);
    expect(
      resolveEsimMaxChargeSetting('nope', {
        defaultValue: ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
        hardMax: 500_000_000,
      }),
    ).toBe(2_000_000);
    expect(
      resolveEsimMaxChargeSetting(-1, {
        defaultValue: ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
        hardMax: 500_000_000,
      }),
    ).toBe(2_000_000);
    expect(
      resolveEsimMaxChargeSetting(0, {
        defaultValue: ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT,
        hardMax: 500_000_000,
      }),
    ).toBe(0);
  });

  it('allows and blocks VND at the inclusive boundary', () => {
    const limits = resolveEsimChargeLimitConfig({});
    expect(limits.maxVnd).toBe(ESIM_MAX_CHARGE_AMOUNT_VND_DEFAULT);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 1_999_999,
        chargeCurrency: 'VND',
        maxVnd: limits.maxVnd,
        maxUsd: limits.maxUsd,
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 2_000_000,
        chargeCurrency: 'VND',
        maxVnd: limits.maxVnd,
        maxUsd: limits.maxUsd,
      }).ok,
    ).toBe(true);
    const blocked = evaluateEsimChargeLimit({
      chargeAmount: 2_000_001,
      chargeCurrency: 'VND',
      maxVnd: limits.maxVnd,
      maxUsd: limits.maxUsd,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('ESIM_ORDER_AMOUNT_LIMIT');
      expect(blocked.effectiveLimit).toBe(2_000_000);
    }
  });

  it('disables VND cap when setting is 0', () => {
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 50_000_000,
        chargeCurrency: 'VND',
        maxVnd: 0,
        maxUsd: 80,
      }).ok,
    ).toBe(true);
  });

  it('C1: PayPal overall hard-caps at 80 even when Admin is higher or stored over hard max', () => {
    expect(ESIM_MAX_CHARGE_AMOUNT_USD_HARD_MAX).toBe(80);
    expect(resolvePaypalOverallUsdCap(100)).toBe(80);
    expect(resolvePaypalOverallUsdCap(80)).toBe(80);
    expect(resolvePaypalOverallUsdCap(50)).toBe(50);
    expect(resolvePaypalOverallUsdCap(0)).toBe(80);
    expect(resolvePaypalOverallUsdCap(-1)).toBe(80);
    expect(resolveEsimChargeLimitConfig({ esimMaxChargeAmountUsd: 100 }).maxUsd).toBe(
      ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT,
    );
    expect(
      effectivePaypalUsdOrderCap({ maxUsdSetting: 100, accountAgeHours: 100 }).effectiveLimit,
    ).toBe(80);
    expect(
      effectivePaypalUsdOrderCap({ maxUsdSetting: 50, accountAgeHours: 100 }).effectiveLimit,
    ).toBe(50);
  });

  it('allows and blocks USD at the inclusive boundary for mature accounts', () => {
    const limits = resolveEsimChargeLimitConfig({});
    expect(limits.maxUsd).toBe(ESIM_MAX_CHARGE_AMOUNT_USD_DEFAULT);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 79.99,
        chargeCurrency: 'USD',
        maxVnd: limits.maxVnd,
        maxUsd: limits.maxUsd,
        accountAgeHours: 100,
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 80,
        chargeCurrency: 'USD',
        maxVnd: limits.maxVnd,
        maxUsd: limits.maxUsd,
        accountAgeHours: 100,
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 80.01,
        chargeCurrency: 'USD',
        maxVnd: limits.maxVnd,
        maxUsd: limits.maxUsd,
        accountAgeHours: 100,
      }).ok,
    ).toBe(false);
  });

  it('keeps new-account 30 when admin USD limit is 80', () => {
    expect(
      effectivePaypalUsdOrderCap({ maxUsdSetting: 80, accountAgeHours: 1 }).effectiveLimit,
    ).toBe(30);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 30,
        chargeCurrency: 'USD',
        maxVnd: 2_000_000,
        maxUsd: 80,
        accountAgeHours: 1,
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 30.01,
        chargeCurrency: 'USD',
        maxVnd: 2_000_000,
        maxUsd: 80,
        accountAgeHours: 1,
      }).ok,
    ).toBe(false);
  });

  it('uses the lower admin USD limit when below new-account 30', () => {
    expect(
      effectivePaypalUsdOrderCap({ maxUsdSetting: 20, accountAgeHours: 1 }).effectiveLimit,
    ).toBe(20);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 20,
        chargeCurrency: 'USD',
        maxVnd: 2_000_000,
        maxUsd: 20,
        accountAgeHours: 1,
      }).ok,
    ).toBe(true);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 20.01,
        chargeCurrency: 'USD',
        maxVnd: 2_000_000,
        maxUsd: 20,
        accountAgeHours: 1,
      }).ok,
    ).toBe(false);
  });

  it('falls back to PayPal hardcap 80 when admin USD setting is 0', () => {
    expect(
      effectivePaypalUsdOrderCap({ maxUsdSetting: 0, accountAgeHours: 100 }).effectiveLimit,
    ).toBe(80);
    expect(
      evaluateEsimChargeLimit({
        chargeAmount: 80.01,
        chargeCurrency: 'USD',
        maxVnd: 2_000_000,
        maxUsd: 0,
        accountAgeHours: 100,
      }).ok,
    ).toBe(false);
  });

  it('C2: accountAgeHoursFromCreatedAt is fail-closed for missing/invalid timestamps', () => {
    const now = new Date('2026-11-07T10:00:00.000Z');
    expect(accountAgeHoursFromCreatedAt(null, now)).toBeNull();
    expect(accountAgeHoursFromCreatedAt(undefined, now)).toBeNull();
    expect(accountAgeHoursFromCreatedAt('not-a-date', now)).toBeNull();
    const young = new Date(now.getTime() - 12 * 3_600_000);
    expect(accountAgeHoursFromCreatedAt(young, now)).toBe(12);
    const mature = new Date(
      now.getTime() - DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxAgeHours * 3_600_000,
    );
    expect(accountAgeHoursFromCreatedAt(mature, now)).toBe(
      DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxAgeHours,
    );
    // Boundary: age == threshold is mature (rule uses < age hours for new).
    expect(
      effectivePaypalUsdOrderCap({
        maxUsdSetting: 80,
        accountAgeHours: DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxAgeHours,
      }).isNewAccount,
    ).toBe(false);
    expect(
      effectivePaypalUsdOrderCap({
        maxUsdSetting: 80,
        accountAgeHours: DEFAULT_PAYPAL_ESIM_LIMITS.newAccountMaxAgeHours - 0.001,
      }).isNewAccount,
    ).toBe(true);
  });
});
