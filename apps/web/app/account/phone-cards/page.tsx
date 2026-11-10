'use client';

import { PurchasedCardsPanel } from '@/components/account/PurchasedCardsPanel';
import { useT } from '@/components/i18n/LocaleProvider';

export default function AccountPhoneCardsPage() {
  const t = useT();
  return (
    <PurchasedCardsPanel
      homeService="PHONE_CARD"
      title={t('account.phoneCards')}
      emptyLabel="Chưa có thẻ điện thoại đã giao."
    />
  );
}
