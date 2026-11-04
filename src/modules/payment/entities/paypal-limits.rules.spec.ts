import {
  DEFAULT_PAYPAL_ESIM_LIMITS,
  evaluatePaypalEsimLimits,
} from './paypal-limits.rules';

describe('evaluatePaypalEsimLimits', () => {
  it('allows a normal international eSIM order', () => {
    expect(
      evaluatePaypalEsimLimits({
        quantity: 1,
        amountUsd: 25,
        ordersPaidToday: 0,
        usdPaidToday: 0,
        accountAgeHours: 100,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects quantity above 1 and over order cap', () => {
    expect(
      evaluatePaypalEsimLimits({
        quantity: 2,
        amountUsd: 25,
        ordersPaidToday: 0,
        usdPaidToday: 0,
        accountAgeHours: 100,
      }).ok,
    ).toBe(false);
    expect(
      evaluatePaypalEsimLimits({
        quantity: 1,
        amountUsd: DEFAULT_PAYPAL_ESIM_LIMITS.maxUsdPerOrder + 1,
        ordersPaidToday: 0,
        usdPaidToday: 0,
        accountAgeHours: 100,
      }),
    ).toEqual({ ok: false, reason: 'ORDER_CAP' });
  });

  it('applies tighter cap for new accounts and daily totals', () => {
    expect(
      evaluatePaypalEsimLimits({
        quantity: 1,
        amountUsd: 40,
        ordersPaidToday: 0,
        usdPaidToday: 0,
        accountAgeHours: 1,
      }),
    ).toEqual({ ok: false, reason: 'NEW_ACCOUNT_ORDER_CAP' });
    expect(
      evaluatePaypalEsimLimits({
        quantity: 1,
        amountUsd: 20,
        ordersPaidToday: 3,
        usdPaidToday: 0,
        accountAgeHours: 100,
      }),
    ).toEqual({ ok: false, reason: 'DAILY_ORDER_COUNT' });
  });
});
