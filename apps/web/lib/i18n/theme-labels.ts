import { sanitizeCompanyChromeLabel } from '../company-chrome';
import type { Locale } from './locale';
import { isMessageKey, translate, type MessageKey } from './messages';

export type ThemeLabel = {
  label: string;
  labelEn?: string;
  /** Explicit catalog key for a built-in system item. Never inferred from href or label text. */
  navKey?: string;
};

export type ThemeTitle = {
  title: string;
  titleEn?: string;
  titleKey?: string;
};

export const SYSTEM_HEADER_MENU: Array<ThemeLabel & { href: string; sortOrder: number }> = [
  { label: 'Trang chủ', href: '/', sortOrder: 0, navKey: 'nav.home' },
  { label: 'Mua thẻ', href: '/#mua-the', sortOrder: 1, navKey: 'nav.buyCards' },
  { label: 'Nạp cước', href: '/nap-cuoc', sortOrder: 2, navKey: 'nav.topup' },
  { label: 'Nạp Data', href: '/nap-data', sortOrder: 3, navKey: 'nav.data' },
  { label: 'Tin tức', href: '/tin-tuc', sortOrder: 4, navKey: 'nav.news' },
];

function catalogText(locale: Locale, key: string | null | undefined): string | null {
  if (!key || !isMessageKey(key)) return null;
  const value = translate(locale, key);
  return value && value !== key ? value : null;
}

/**
 * Vietnamese uses `label`. English uses `labelEn` when present, then an explicit
 * `navKey`. A custom item without those fields keeps its stored label.
 * Href and the Vietnamese wording are not used to choose a translation.
 */
export function resolveMenuLabel(locale: Locale, item: ThemeLabel): string {
  const label = (item.label ?? '').trim();
  if (locale !== 'en') return label;
  const labelEn = item.labelEn?.trim();
  if (labelEn) return labelEn;
  return catalogText('en', item.navKey) ?? label;
}

export function resolveThemeTitle(locale: Locale, item: ThemeTitle): string {
  const title = (item.title ?? '').trim();
  if (locale !== 'en') return title;
  const titleEn = item.titleEn?.trim();
  if (titleEn) return titleEn;
  return catalogText('en', item.titleKey) ?? title;
}

export function resolveThemeDescription(
  locale: Locale,
  description?: string,
  descriptionEn?: string,
): string {
  const vi = description?.trim() ?? '';
  if (locale !== 'en') return vi;
  const en = descriptionEn?.trim();
  return en || vi;
}

export function presentFooterLink(
  locale: Locale,
  link: ThemeLabel & { valueLabelKey?: string; valueLabelEn?: string; valueEn?: string },
): string {
  const value =
    locale === 'en' && link.valueEn?.trim() ? link.valueEn.trim() : (link.label ?? '').trim();
  const customEn =
    locale === 'en' ? sanitizeCompanyChromeLabel(link.valueLabelEn, value) : undefined;
  if (link.valueLabelKey && isMessageKey(link.valueLabelKey)) {
    const prefix = customEn || translate(locale, link.valueLabelKey as MessageKey);
    return `${prefix}: ${value}`;
  }
  if (customEn) return `${customEn}: ${value}`;
  return resolveMenuLabel(locale, link);
}

export function menuLabels(locale: Locale, items: ThemeLabel[]): string[] {
  return items.map((item) => resolveMenuLabel(locale, item));
}
