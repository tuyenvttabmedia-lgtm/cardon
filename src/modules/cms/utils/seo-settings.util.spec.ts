import { normalizeSearchConsoleVerification } from '../utils/seo-settings.util';

describe('normalizeSearchConsoleVerification', () => {
  it('returns plain verification code', () => {
    expect(normalizeSearchConsoleVerification('abc123')).toBe('abc123');
  });

  it('strips content: prefix', () => {
    expect(
      normalizeSearchConsoleVerification('content: 1KC_nKKpl1wiIOQZNUuoHK4ghVPenrKbjkMC1ZIHeNI'),
    ).toBe('1KC_nKKpl1wiIOQZNUuoHK4ghVPenrKbjkMC1ZIHeNI');
  });

  it('strips content: prefix with quotes', () => {
    expect(
      normalizeSearchConsoleVerification('content: "token123"'),
    ).toBe('token123');
  });

  it('extracts code from meta tag HTML', () => {
    expect(
      normalizeSearchConsoleVerification(
        '<meta name="google-site-verification" content="token123" />',
      ),
    ).toBe('token123');
  });
});
