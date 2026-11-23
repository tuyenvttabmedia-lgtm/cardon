'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  formatLocaleDateTime,
  formatLocaleVnd,
  type Locale,
  localeSwitchTarget,
  stripLocalePrefix,
  withLocalePrefix,
} from '@/lib/i18n/locale';
import { translate, type MessageKey } from '@/lib/i18n/messages';

const LocaleContext = createContext<{
  locale: Locale;
  t: (key: MessageKey) => string;
  setLocale: (next: Locale) => void;
} | null>(null);

function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || '/';
  const [locale, setLocaleState] = useState<Locale>(initialLocale || DEFAULT_LOCALE);

  const value = useMemo(
    () => ({
      locale,
      t: (key: MessageKey) => translate(locale, key),
      setLocale: (next: Locale) => {
        writeLocaleCookie(next);
        setLocaleState(next);
        const query = window.location.search;
        // Full document navigation: /en/* rewrites onto the VI route tree, so soft
        // router.push can reuse a cached Vietnamese RSC (news + policy pages).
        window.location.assign(localeSwitchTarget(pathname, query, next));
      },
    }),
    [locale, pathname],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE as Locale,
      t: (key: MessageKey) => translate(DEFAULT_LOCALE, key),
      setLocale: (_next: Locale) => undefined,
    };
  }
  return ctx;
}

export function useT() {
  return useLocale().t;
}

export function useBarePath() {
  const pathname = usePathname() || '/';
  return stripLocalePrefix(pathname).pathname || '/';
}

/** Prefix internal hrefs with /en when the UI locale is English. */
export function useLocalizedHref() {
  const { locale } = useLocale();
  return (path: string) => withLocalePrefix(path, locale);
}

export function useMoney() {
  const { locale } = useLocale();
  return (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return formatLocaleVnd(Number.isFinite(value) ? value : 0, locale);
  };
}

export function useDateTime() {
  const { locale } = useLocale();
  return (value: string | number | Date) => formatLocaleDateTime(value, locale);
}
