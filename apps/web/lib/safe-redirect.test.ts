import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-redirect';

describe('safeInternalPath', () => {
  it('allows relative storefront paths and rejects open redirects', () => {
    expect(safeInternalPath('/checkout', '/')).toBe('/checkout');
    expect(safeInternalPath('/en/orders/1', '/')).toBe('/en/orders/1');
    expect(safeInternalPath('https://evil.com', '/')).toBe('/');
    expect(safeInternalPath('//evil.com', '/')).toBe('/');
    expect(safeInternalPath('/\\evil.com', '/')).toBe('/');
  });
});
