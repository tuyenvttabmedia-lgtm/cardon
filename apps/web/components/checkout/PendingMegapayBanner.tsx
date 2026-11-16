'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { withLocalePrefix } from '@/lib/i18n/locale';
import {
  buildMegapayWaitingPath,
  readPendingMegapayPayment,
  type PendingMegapayPayment,
} from '@/lib/pending-megapay-payment';

function isCheckoutStationPath(pathname: string): boolean {
  return (
    pathname.includes('/checkout/waiting') ||
    pathname.includes('/checkout/result') ||
    pathname.includes('/checkout/success') ||
    pathname.includes('/checkout/pay')
  );
}

/** Sticky reminder when a MegaPay session is still open in this browser tab. */
export function PendingMegapayBanner() {
  const pathname = usePathname();
  const t = useT();
  const { locale } = useLocale();
  const [pending, setPending] = useState<PendingMegapayPayment | null>(null);

  useEffect(() => {
    function refresh() {
      setPending(readPendingMegapayPayment());
    }
    refresh();
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [pathname]);

  if (!pending || isCheckoutStationPath(pathname)) return null;

  const href = withLocalePrefix(
    buildMegapayWaitingPath({
      orderId: pending.orderId,
      orderCode: pending.orderCode,
      email: pending.email,
      open: false,
    }),
    locale,
  );

  return (
    <div className="sticky top-14 z-30 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 md:top-16">
      <div className="site-container flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1">
          <span className="font-semibold">{t('wait.bannerTitle')}</span>{' '}
          <span className="text-amber-900">
            {pending.orderCode}
            {pending.amount ? ` · ${pending.amount}đ` : ''}
          </span>
        </p>
        <Link
          href={href}
          className="shrink-0 rounded-lg bg-cardon-blue px-3 py-1.5 text-xs font-bold text-white hover:bg-cardon-navy"
        >
          {t('wait.bannerCta')}
        </Link>
      </div>
    </div>
  );
}
