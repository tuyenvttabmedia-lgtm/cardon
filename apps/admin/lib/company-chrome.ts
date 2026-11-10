/**
 * Mirrors apps/web/lib/company-chrome.ts — keep rules in sync.
 * `*LabelEn` is only the short title before ":" (Tax ID, Address, Hours…).
 */

function comparable(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function looksLikeWorkingHoursContent(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (/^\d{1,2}:\d{2}/.test(value)) return true;
  return /\b(mon|tue|wed|thu|fri|sat|sun|monday|sunday|t2|t3|t4|t5|t6|t7|cn)\b/i.test(value);
}

export function sanitizeCompanyChromeLabel(
  labelEn: string | null | undefined,
  value?: string | null,
): string {
  const label = (labelEn ?? '').trim();
  if (!label) return '';

  const v = (value ?? '').trim();
  if (v && comparable(label) === comparable(v)) return '';
  if (label.includes('@')) return '';
  if (/^\+?\d[\d\s.\-]{6,}$/.test(label)) return '';
  if (looksLikeWorkingHoursContent(label)) return '';
  if (label.length > 40) return '';

  return label;
}

export function resolveWorkingHoursEn(
  workingHoursEn: string | null | undefined,
  hoursLabelEn: string | null | undefined,
): string {
  const explicit = (workingHoursEn ?? '').trim();
  if (explicit) return explicit;
  const mistaken = (hoursLabelEn ?? '').trim();
  if (mistaken && looksLikeWorkingHoursContent(mistaken)) return mistaken;
  return '';
}
