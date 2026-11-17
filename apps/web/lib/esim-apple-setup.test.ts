import { describe, expect, it } from 'vitest';
import { isAndroidMobileDevice, isAppleMobileDevice, isIosSafari } from './esim-apple-setup';

describe('esim-apple-setup', () => {
  it('detects iPhone Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    expect(isAppleMobileDevice(ua)).toBe(true);
    expect(isAndroidMobileDevice(ua)).toBe(false);
    expect(isIosSafari(ua)).toBe(true);
  });

  it('detects iPhone Chrome but not as Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
    expect(isAppleMobileDevice(ua)).toBe(true);
    expect(isAndroidMobileDevice(ua)).toBe(false);
    expect(isIosSafari(ua)).toBe(false);
  });

  it('detects Android Chrome', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
    expect(isAndroidMobileDevice(ua)).toBe(true);
    expect(isAppleMobileDevice(ua)).toBe(false);
  });

  it('rejects desktop Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
    expect(isAppleMobileDevice(ua)).toBe(false);
    expect(isAndroidMobileDevice(ua)).toBe(false);
    expect(isIosSafari(ua)).toBe(false);
  });
});
