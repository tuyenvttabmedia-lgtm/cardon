'use client';

import { PurchasedCardsPanel } from '@/components/account/PurchasedCardsPanel';
import { useT } from '@/components/i18n/LocaleProvider';

export default function AccountGameCardsPage() {
  const t = useT();
  return (
    <PurchasedCardsPanel
      homeService="GAME_CARD"
      title={t('account.gameCards')}
      emptyLabel="Chưa có thẻ game đã giao."
    />
  );
}
