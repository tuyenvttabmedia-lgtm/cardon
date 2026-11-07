export type Locale = 'vi' | 'en';

export const LOCALES: readonly Locale[] = ['vi', 'en'];
export const DEFAULT_LOCALE: Locale = 'vi';
export const LOCALE_COOKIE = 'cardon_locale';
export const LOCALE_HEADER = 'x-cardon-locale';
export const PUBLIC_PATH_HEADER = 'x-cardon-public-path';

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'vi' || value === 'en';
}

export function stripLocalePrefix(pathname: string): { locale: Locale | null; pathname: string } {
  if (pathname === '/en') return { locale: 'en', pathname: '/' };
  if (pathname.startsWith('/en/')) {
    const rest = pathname.slice(3);
    return { locale: 'en', pathname: rest.startsWith('/') ? rest : `/${rest}` };
  }
  return { locale: null, pathname: pathname || '/' };
}

export function withLocalePrefix(pathname: string, locale: Locale): string {
  const bare = stripLocalePrefix(pathname).pathname || '/';
  if (locale === 'vi') return bare;
  return bare === '/' ? '/en' : `/en${bare}`;
}

/** Client language switch. Keeps the current path and query. Does not touch POST. */
export function localeSwitchTarget(pathname: string, search: string, locale: Locale): string {
  const query = !search ? '' : search.startsWith('?') ? search : `?${search}`;
  return `${withLocalePrefix(pathname, locale)}${query}`;
}

export function resolveLocale(input: { pathname?: string | null; cookie?: string | null }): Locale {
  const fromPath = input.pathname ? stripLocalePrefix(input.pathname).locale : null;
  if (fromPath === 'en') return 'en';
  if (input.cookie === 'en') return 'en';
  return DEFAULT_LOCALE;
}

export type LocaleRouting =
  | { action: 'redirect'; pathname: string; locale: Locale }
  | { action: 'rewrite'; internalPath: string; locale: 'en' }
  | { action: 'continue'; locale: 'vi' };

/**
 * `/en/...` rewrites onto the existing Vietnamese route.
 * A saved English choice redirects later GET navigations onto `/en`.
 * Vietnamese URLs stay unchanged when no English choice is stored.
 */
export function localeRoutingDecision(input: {
  pathname: string;
  cookie?: string | null;
  method?: string;
}): LocaleRouting {
  const stripped = stripLocalePrefix(input.pathname);
  if (stripped.locale === 'en' && input.cookie === 'vi') {
    return { action: 'redirect', pathname: stripped.pathname, locale: 'vi' };
  }
  if (stripped.locale === 'en') {
    return { action: 'rewrite', internalPath: stripped.pathname, locale: 'en' };
  }
  if (input.cookie === 'en' && (input.method ?? 'GET').toUpperCase() === 'GET') {
    return {
      action: 'redirect',
      pathname: withLocalePrefix(stripped.pathname, 'en'),
      locale: 'en',
    };
  }
  return { action: 'continue', locale: 'vi' };
}

export function formatLocaleDateTime(value: string | number | Date, locale: Locale): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatLocaleVnd(amount: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function readBrowserLocale(): Locale {
  if (typeof document === 'undefined') return DEFAULT_LOCALE;
  return readLocaleCookie(document.cookie) ?? DEFAULT_LOCALE;
}

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)cardon_locale=(vi|en)(?:;|$)/);
  return match && isLocale(match[1]) ? match[1] : null;
}
