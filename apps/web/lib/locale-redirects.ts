import { ACCOUNT_PATHS, REMOVED_CUSTOMER_PORTAL_REDIRECTS } from '@/lib/account-routes';
import { withLocalePrefix } from '@/lib/i18n/locale';

const EXACT_REDIRECTS: Record<string, string> = {
  '/partner/register': '/dang-ky-dai-ly',
  '/account': ACCOUNT_PATHS.profile,
  '/account/orders': ACCOUNT_PATHS.orders,
  '/account/cards': ACCOUNT_PATHS.cards,
  '/account/topups': ACCOUNT_PATHS.topups,
  '/account/data': ACCOUNT_PATHS.data,
  '/account/support': ACCOUNT_PATHS.support,
  '/account/password': ACCOUNT_PATHS.password,
  '/tai-khoan/don-hang': ACCOUNT_PATHS.orders,
  '/tai-khoan/kho-pin': ACCOUNT_PATHS.cards,
  '/tai-khoan/bao-mat': ACCOUNT_PATHS.password,
  '/tai-khoan/thong-bao': '/',
  '/huong-dan': '/tin-tuc/huong-dan',
  '/khuyen-mai': '/tin-tuc/khuyen-mai',
  ...REMOVED_CUSTOMER_PORTAL_REDIRECTS,
};

/**
 * Legacy destinations for an English public URL.
 * Returns the /en path so a later rewrite cannot drop the prefix.
 * Vietnamese requests stay on the existing next.config redirects.
 */
export function englishLegacyRedirect(pathname: string, searchParams: URLSearchParams): string | null {
  const consumed = new Set<string>();
  let destination: string | null = null;

  if (pathname === '/cards') {
    const service = searchParams.get('service');
    if (service === 'PHONE_CARD') destination = '/the-dien-thoai';
    else if (service === 'TOPUP') destination = '/nap-cuoc';
    else if (service === 'DATA') destination = '/nap-data';
    else destination = '/the-game';
    consumed.add('service');
  } else if (pathname.startsWith('/pages/')) {
    const slug = pathname.slice('/pages/'.length).split('/').filter(Boolean)[0];
    if (!slug) return null;
    destination = `/${slug}`;
  } else {
    destination = EXACT_REDIRECTS[pathname] ?? null;
  }

  if (!destination) return null;
  const localized = withLocalePrefix(destination, 'en');
  if (localized === withLocalePrefix(pathname, 'en')) return null;

  const next = new URLSearchParams(searchParams);
  for (const key of consumed) next.delete(key);
  const qs = next.toString();
  return qs ? `${localized}?${qs}` : localized;
}
