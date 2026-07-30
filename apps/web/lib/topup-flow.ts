import type { HomeCategory } from '@/lib/home-catalog';

import { normalizeVnPhone } from '@/lib/checkout-validation';

/** Detect carrier from VN mobile prefix (user may override manually). */
export function detectTelcoFromPhone(input: string): string | null {
  const digits = normalizeVnPhone(input).replace(/\D/g, '');
  if (digits.length < 3) return null;

  const prefix3 = digits.slice(0, 3);
  const prefix4 = digits.length >= 4 ? digits.slice(0, 4) : '';

  const viettel = new Set(['032', '033', '034', '035', '036', '037', '038', '039', '096', '097', '098', '086']);
  const mobifone = new Set(['070', '076', '077', '078', '079', '089', '090', '093']);
  const vinaphone = new Set(['081', '082', '083', '084', '085', '088', '091', '094']);
  const vietnamobile = new Set(['052', '056', '058', '092']);

  // Vietnamobile before Viettel: "vietnamobile" must not be claimed by viettel substring checks elsewhere.
  if (vietnamobile.has(prefix3) || prefix4 === '0920') return 'vietnamobile';
  if (viettel.has(prefix3)) return 'viettel';
  if (mobifone.has(prefix3)) return 'mobifone';
  if (vinaphone.has(prefix3)) return 'vinaphone';

  return null;
}

export const TOPUP_CARRIERS = [
  { id: 'viettel', label: 'Viettel' },
  { id: 'mobifone', label: 'Mobifone' },
  { id: 'vinaphone', label: 'Vinaphone' },
  { id: 'vietnamobile', label: 'Vietnamobile' },
] as const;

export const DATA_CARRIERS = TOPUP_CARRIERS.filter((c) => c.id !== 'vietnamobile');

export type TopupFlowCategory = 'topup' | 'data';

/**
 * Match product ↔ carrier.
 * Important: "vietnamobile" contains "viettel" and "vina" — never use naive substring regex.
 */
export function matchCarrier(product: { slug: string; name: string }, carrierId: string): boolean {
  const slug = product.slug.toLowerCase();
  const name = product.name.toLowerCase();
  const text = `${slug} ${name}`;

  switch (carrierId) {
    case 'vietnamobile':
      return /vietnamobile|vnmobile/.test(text);
    case 'viettel':
      return /viettel/.test(text) && !/vietnamobile|vnmobile/.test(text);
    case 'vinaphone':
      return /vinaphone/.test(text) || (/(^|[^a-z])vina([^a-z]|$)/.test(text) && !/vietnamobile/.test(text));
    case 'mobifone':
      return /mobifone|mobiphone/.test(text) || /(^|[^a-z])mobi([^a-z]|$)/.test(text);
    default:
      return true;
  }
}

export function carrierLabel(carrierId: string | null | undefined): string | undefined {
  return TOPUP_CARRIERS.find((c) => c.id === carrierId)?.label;
}

export function flowCategoryToHomeCategory(flow: TopupFlowCategory): HomeCategory {
  return flow;
}

export function sortedVariantsByFaceValue<T extends { faceValue: string }>(variants: T[]): T[] {
  return [...variants].sort((a, b) => parseFloat(a.faceValue) - parseFloat(b.faceValue));
}
