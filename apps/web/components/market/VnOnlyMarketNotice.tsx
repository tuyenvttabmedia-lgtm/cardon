'use client';

import { useT } from '@/components/i18n/LocaleProvider';

export function VnOnlyMarketNotice() {
  const t = useT();
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      {t('market.vnOnly')}
    </p>
  );
}
