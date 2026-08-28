import { buildInputHash, estimateCostUsd } from './input-hash.util';

describe('input-hash.util', () => {
  it('builds deterministic hash', () => {
    const a = buildInputHash('system', 'user');
    const b = buildInputHash('system', 'user');
    expect(a).toBe(b);
    expect(a.length).toBeLessThanOrEqual(64);
  });

  it('estimates cost for gpt-4.1-mini', () => {
    const cost = estimateCostUsd('gpt-4.1-mini', 1000, 500);
    expect(cost).not.toBeNull();
    expect(Number(cost)).toBeGreaterThan(0);
  });

  it('returns null cost when token usage is missing', () => {
    expect(estimateCostUsd('gpt-4.1-mini', null, 500)).toBeNull();
    expect(estimateCostUsd('gpt-4.1-mini', 1000, null)).toBeNull();
  });
});
