/** Apple eSIM Universal Link (`esimsetup.apple.com`) only works on-device. */

export function isAppleMobileDevice(ua?: string): boolean {
  if (typeof navigator === 'undefined' && !ua) return false;
  const agent = ua ?? navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(agent)) return true;
  // iPadOS desktop-class UA
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) {
    return true;
  }
  return false;
}

/** Safari on iOS (not Chrome/Firefox/Edge wrappers). */
export function isIosSafari(ua?: string): boolean {
  if (!isAppleMobileDevice(ua)) return false;
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!/Safari/i.test(agent)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(agent);
}
