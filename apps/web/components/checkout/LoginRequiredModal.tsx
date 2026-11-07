'use client';

import Link from 'next/link';
import { useLocale, useT } from '@/components/i18n/LocaleProvider';
import { buildCheckoutRedirectUrl } from '@/lib/checkout-persistence';
import { withLocalePrefix } from '@/lib/i18n/locale';

interface Props {
  open: boolean;
  onClose: () => void;
  redirectPath?: string;
}

export function LoginRequiredModal({ open, onClose, redirectPath }: Props) {
  const t = useT();
  const { locale } = useLocale();
  if (!open) return null;

  const redirect = encodeURIComponent(redirectPath || buildCheckoutRedirectUrl());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-bold text-cardon-navy">{t('checkout.loginContinue')}</h2>
        <p className="mt-2 text-sm text-cardon-gray">
          {t('checkout.loginBody')}
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link
            href={`${withLocalePrefix('/login', locale)}?redirect=${redirect}`}
            className="flex-1 rounded-xl bg-cardon-blue py-2.5 text-center text-sm font-semibold text-white hover:bg-cardon-navy"
            onClick={onClose}
          >
            {t('nav.login')}
          </Link>
          <Link
            href={`${withLocalePrefix('/register', locale)}?redirect=${redirect}`}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-cardon-navy hover:bg-gray-50"
            onClick={onClose}
          >
            {t('checkout.createAccount')}
          </Link>
        </div>
        <button type="button" className="mt-4 w-full text-sm text-cardon-gray hover:text-cardon-navy" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
