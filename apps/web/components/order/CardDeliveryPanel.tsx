'use client';

import { useMemo, useState } from 'react';
import { PurchasedCardActions } from '@/components/account/PurchasedCardActions';
import { ListPagination } from '@/components/ui/ListPagination';
import { useDateTime, useLocale, useT } from '@/components/i18n/LocaleProvider';
import { customerFacingError } from '@/lib/i18n/customer-error';
import { orderApi } from '@/services/api-client';
import type { CardSummary } from '@/types/api';

const CARD_PAGE_SIZES = [10, 50, 100] as const;

export function CardDeliveryPanel({
  orderId,
  cards,
  guestEmail,
}: {
  orderId: string;
  cards: CardSummary[];
  guestEmail?: string;
}) {
  const [take, setTake] = useState<number>(CARD_PAGE_SIZES[0]);
  const [skip, setSkip] = useState(0);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const t = useT();
  const { locale } = useLocale();
  const formatWhen = useDateTime();

  const visibleCards = useMemo(
    () => cards.slice(skip, skip + take),
    [cards, skip, take],
  );

  async function revealPin(card: CardSummary) {
    if (pins[card.id]) return;
    setLoadingId(card.id);
    setErrors((prev) => ({ ...prev, [card.id]: '' }));
    try {
      const result = await orderApi.revealPin(orderId, card.id, guestEmail);
      setPins((prev) => ({ ...prev, [card.id]: result.pin }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [card.id]: customerFacingError(locale, err instanceof Error ? err : new Error(t('order.cannotShow'))),
      }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        {t('order.pinProtected')}
      </p>
      {visibleCards.map((card) => {
        const pin = pins[card.id];
        const revealed = !!pin || card.pinViewCount > 0;
        return (
          <div
            key={card.id}
            className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm"
          >
            <p className="text-base font-semibold text-gray-900">{card.productName}</p>
            <PurchasedCardActions
              serial={card.serial}
              pin={pin}
              pinMasked={card.pinMasked}
              revealLoading={loadingId === card.id}
              onReveal={() => void revealPin(card)}
              error={errors[card.id] || null}
              viewCountLabel={
                revealed && card.pinFirstViewedAt
                  ? `${t('order.firstView')}: ${formatWhen(card.pinFirstViewedAt)}`
                  : null
              }
            />
          </div>
        );
      })}
      <ListPagination
        skip={skip}
        take={take}
        total={cards.length}
        onPageChange={setSkip}
        onPageSizeChange={setTake}
        pageSizeOptions={CARD_PAGE_SIZES}
        itemLabel={t('order.card')}
      />
    </div>
  );
}
