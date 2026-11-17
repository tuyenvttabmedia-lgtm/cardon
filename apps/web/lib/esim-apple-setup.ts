/** Apple / Android eSIM one-tap links only work on the matching device. */

export function appleEsimSetupUrl(lpa: string): string | null {
  const trimmed = lpa.trim();
  if (!trimmed.startsWith('LPA:1$')) return null;
  return `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(trimmed)}`;
}

export function androidEsimSetupUrl(lpa: string): string | null {
  const trimmed = lpa.trim();
  if (!trimmed.startsWith('LPA:1$')) return null;
  return `https://esimsetup.android.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(trimmed)}`;
}

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

/** Android phone/tablet UA (not iOS, not desktop Chrome pretending via request desktop site). */
export function isAndroidMobileDevice(ua?: string): boolean {
  if (typeof navigator === 'undefined' && !ua) return false;
  if (isAppleMobileDevice(ua)) return false;
  const agent = ua ?? navigator.userAgent;
  return /Android/i.test(agent);
}

/** Safari on iOS (not Chrome/Firefox/Edge wrappers). */
export function isIosSafari(ua?: string): boolean {
  if (!isAppleMobileDevice(ua)) return false;
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!/Safari/i.test(agent)) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Android/i.test(agent);
}
