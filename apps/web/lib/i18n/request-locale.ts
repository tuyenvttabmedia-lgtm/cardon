import { headers } from 'next/headers';
import { LOCALE_HEADER, type Locale } from '@/lib/i18n/locale';

/** Locale already resolved by middleware. Content fetches opt in; sitemap and global SEO do not. */
export async function readRequestLocale(): Promise<Locale> {
  const headerList = await headers();
  return headerList.get(LOCALE_HEADER) === 'en' ? 'en' : 'vi';
}
