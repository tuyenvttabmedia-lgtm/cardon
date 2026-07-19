export const CMS_PERMISSION = 'cms.manage';

/** Known embed positions — extend as product pages need FAQ blocks. */
export const FAQ_POSITIONS = [
  'contact',
  'topup',
  'data',
  'garena',
  'viettel',
  'mobifone',
] as const;

export type FaqPositionValue = (typeof FAQ_POSITIONS)[number];

export const FAQ_POSITION_LABELS: Record<FaqPositionValue, string> = {
  contact: 'Liên hệ',
  topup: 'Nạp cước',
  data: 'Nạp data',
  garena: 'Garena',
  viettel: 'Viettel',
  mobifone: 'Mobifone',
};

export const DEFAULT_FAQ_CATEGORY_SLUG = 'chung';

export const CMS_FAQ_SETTING_KEY = 'cms.faq.items';

/** @deprecated JSON FAQ storage — kept for migration only */
export interface LegacyCmsFaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

export function isKnownFaqPosition(value: string): value is FaqPositionValue {
  return (FAQ_POSITIONS as readonly string[]).includes(value);
}
