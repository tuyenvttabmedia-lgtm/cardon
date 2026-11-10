/**
 * Company footer / contact chrome helpers.
 * `*LabelEn` is only the short title before ":" (Tax ID, Address, Hours…).
 * Values that were pasted into label fields by mistake must be ignored or remapped.
 */

function comparable(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** True when text looks like a schedule / hours value, not a chrome title. */
export function looksLikeWorkingHoursContent(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (!value) return false;
  if (/^\d{1,2}:\d{2}/.test(value)) return true;
  return /\b(mon|tue|wed|thu|fri|sat|sun|monday|sunday|t2|t3|t4|t5|t6|t7|cn)\b/i.test(value);
}

/**
 * Keep only short English chrome labels. Reject pasted tax / phone / email / hours values.
 */
export function sanitizeCompanyChromeLabel(
  labelEn: string | null | undefined,
  value?: string | null,
): string | undefined {
  const label = (labelEn ?? '').trim();
  if (!label) return undefined;

  const v = (value ?? '').trim();
  if (v && comparable(label) === comparable(v)) return undefined;
  if (label.includes('@')) return undefined;
  if (/^\+?\d[\d\s.\-]{6,}$/.test(label)) return undefined;
  if (looksLikeWorkingHoursContent(label)) return undefined;
  if (label.length > 40) return undefined;

  return label;
}

/** Remap a mistaken hours "label" into English hours content. */
export function resolveWorkingHoursEn(
  workingHoursEn: string | null | undefined,
  hoursLabelEn: string | null | undefined,
): string | undefined {
  const explicit = (workingHoursEn ?? '').trim();
  if (explicit) return explicit;
  const mistaken = (hoursLabelEn ?? '').trim();
  if (mistaken && looksLikeWorkingHoursContent(mistaken)) return mistaken;
  return undefined;
}
