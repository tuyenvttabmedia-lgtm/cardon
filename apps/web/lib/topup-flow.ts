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

  if (viettel.has(prefix3)) return 'viettel';
  if (mobifone.has(prefix3)) return 'mobifone';
  if (vinaphone.has(prefix3)) return 'vinaphone';
  if (vietnamobile.has(prefix3) || prefix4 === '0920') return 'vietnamobile';

  return null;
}

export const TOPUP_CARRIERS = [
  { id: 'viettel', label: 'Viettel', match: /viettel/i },
  { id: 'mobifone', label: 'Mobifone', match: /mobifone|mobiphone|mobi/i },
  { id: 'vinaphone', label: 'Vinaphone', match: /vinaphone|vina/i },
  { id: 'vietnamobile', label: 'Vietnamobile', match: /vietnamobile|vnmobile/i },
] as const;

export const DATA_CARRIERS = TOPUP_CARRIERS.filter((c) => c.id !== 'vietnamobile');

export type TopupFlowCategory = 'topup' | 'data';

export function matchCarrier(product: { slug: string; name: string }, carrierId: string): boolean {
  const hint = TOPUP_CARRIERS.find((c) => c.id === carrierId);
  if (!hint) return true;
  const text = `${product.slug} ${product.name}`;
  return hint.match.test(text);
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
