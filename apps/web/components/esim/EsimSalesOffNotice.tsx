'use client';

import { useT } from '@/components/i18n/LocaleProvider';

export function EsimSalesOffNotice({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <div
      role="status"
      className={
        compact
          ? 'rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950'
          : 'rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950'
      }
    >
      <p className="font-semibold">{t('esim.salesOffTitle')}</p>
      <p className="mt-1 leading-relaxed">{t('esim.salesOffBody')}</p>
    </div>
  );
}
