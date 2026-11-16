'use client';

import Link from 'next/link';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { withLocalePrefix } from '@/lib/i18n/locale';

/** Soft post-purchase CTA for guest eSIM buyers — never blocks delivery. */
export function GuestRegisterUpsell({
  email,
  redirectPath,
}: {
  email: string;
  /** Internal path after register (e.g. /account/esim). */
  redirectPath?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const trimmed = email.trim();
  if (!trimmed) return null;

  const params = new URLSearchParams();
  params.set('email', trimmed);
  if (redirectPath) {
    params.set('redirect', redirectPath);
  }
  const href = withLocalePrefix(`/register?${params.toString()}`, locale);

  return (
    <aside className="rounded-2xl border border-cardon-border bg-brand-50/60 p-4 sm:p-5">
      <p className="text-sm font-semibold text-cardon-navy">{t('order.guestRegisterTitle')}</p>
      <p className="mt-1 text-sm leading-relaxed text-cardon-dark">{t('order.guestRegisterBody')}</p>
      <Link
        href={href}
        className="mt-3 inline-flex h-10 items-center justify-center rounded-xl bg-cardon-blue px-4 text-sm font-semibold text-white transition-colors hover:bg-cardon-navy"
      >
        {t('order.guestRegisterCta')}
      </Link>
      <p className="mt-2 text-xs text-cardon-gray">{t('order.guestRegisterNote')}</p>
    </aside>
  );
}
