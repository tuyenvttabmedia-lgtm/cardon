'use client';

import { useLocale } from '@/components/i18n/LocaleProvider';
import { esimShelfPrice } from '@/lib/esim-checkout-options';

export function EsimShelfPrice({
  sellPriceVnd,
  chargeCurrency,
  chargeAmount,
}: {
  sellPriceVnd: number;
  chargeCurrency?: string | null;
  chargeAmount?: string | null;
}) {
  const { locale } = useLocale();
  return esimShelfPrice(locale, { sellPriceVnd, chargeCurrency, chargeAmount });
}
