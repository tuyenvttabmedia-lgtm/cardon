'use client';

import { useLocale } from '@/components/i18n/LocaleProvider';

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="inline-flex items-center rounded-full border border-cardon-border p-0.5 text-xs font-semibold">
      <span className="sr-only">{t('lang.switch')}</span>
      {(['vi', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className={
            locale === code
              ? 'rounded-full bg-cardon-blue px-2 py-1 text-white'
              : 'rounded-full px-2 py-1 text-cardon-navy hover:bg-cardon-light'
          }
        >
          {compact ? code.toUpperCase() : t(code === 'vi' ? 'lang.vi' : 'lang.en')}
        </button>
      ))}
    </div>
  );
}
