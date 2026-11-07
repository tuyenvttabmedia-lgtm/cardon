import {
  computeMarginPrice,
  DEFAULT_AGENT_MARGIN_CONFIG,
  computePreviewPrice,
} from './agent-margin.constants';

describe('computeMarginPrice (face-based CK)', () => {
  const roundTo = 100;

  it('keeps legacy margin rules separate from the zero eSIM rule', () => {
    expect(DEFAULT_AGENT_MARGIN_CONFIG.services.GAME_CARD).toEqual({
      marginType: 'PERCENT',
      value: 0.5,
    });
    expect(DEFAULT_AGENT_MARGIN_CONFIG.services.PHONE_CARD.value).toBe(0.5);
    expect(DEFAULT_AGENT_MARGIN_CONFIG.services.TOPUP.value).toBe(0.3);
    expect(DEFAULT_AGENT_MARGIN_CONFIG.services.DATA.value).toBe(0.3);
    expect(DEFAULT_AGENT_MARGIN_CONFIG.services.ESIM.value).toBe(0);
    const cardPrice = computeMarginPrice(
      9700,
      10000,
      DEFAULT_AGENT_MARGIN_CONFIG.services.GAME_CARD,
      roundTo,
    );
    expect(cardPrice).toBe(9800);
  });

  it('PHONE_CARD: NCC 3% CK, CardOn 1% → agent 9800', () => {
    const price = computeMarginPrice(
      9700,
      10000,
      { marginType: 'PERCENT', value: 1 },
      roundTo,
    );
    expect(price).toBe(9800);
  });

  it('PHONE_CARD: CardOn 0.5% → 9750 rounds to 9800', () => {
    const price = computeMarginPrice(
      9700,
      10000,
      { marginType: 'PERCENT', value: 0.5 },
      roundTo,
    );
    expect(price).toBe(9800);
  });

  it('clamps when CardOn margin exceeds NCC discount', () => {
    const price = computeMarginPrice(
      9700,
      10000,
      { marginType: 'PERCENT', value: 5 },
      roundTo,
    );
    expect(price).toBe(10000);
  });

  it('FIXED margin adds VND on cost', () => {
    const price = computeMarginPrice(
      9700,
      10000,
      { marginType: 'FIXED', value: 100 },
      roundTo,
    );
    expect(price).toBe(9800);
  });

  it('preview matches raw before round', () => {
    expect(
      computePreviewPrice(9700, 10000, { marginType: 'PERCENT', value: 0.5 }),
    ).toBe(9750);
  });
});
