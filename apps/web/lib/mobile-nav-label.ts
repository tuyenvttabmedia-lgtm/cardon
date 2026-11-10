/**
 * Compact long CMS/i18n labels so a 5–6 item bottom bar stays even on narrow phones.
 * Full titles remain on desktop header / hub pages.
 */
export function compactMobileNavLabel(label: string): string {
  const text = label.trim().replace(/\s+/g, ' ');
  if (!text) return text;

  const lower = text.toLowerCase();
  if (lower === 'thẻ điện thoại' || lower === 'mua thẻ điện thoại') return 'Thẻ ĐT';
  if (lower === 'phone card' || lower === 'phone cards') return 'Phone';
  if (lower === 'esim du lịch' || lower === 'travel esim') return 'eSIM';
  if (lower === 'nạp data' || lower === 'data top-up' || lower === 'data topup') return 'Data';

  return text;
}
