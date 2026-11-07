'use client';

import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';
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
            className="rounded-xl border border-gray-200 bg-gray-50 p-4 shadow-sm"
          >
            <p className="text-base font-semibold text-gray-900">{card.productName}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Serial</p>
                <p className="font-mono text-sm font-semibold">{card.serial}</p>
              </div>
              <CopyButton value={card.serial} label="Copy serial" />
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">{t('order.card')}</p>
                <p className="font-mono text-sm font-semibold">{pin ?? card.pinMasked}</p>
              </div>
              {!pin && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void revealPin(card)}
                  disabled={loadingId === card.id}
                >
                  {loadingId === card.id ? t('common.loading') : t('order.viewCode')}
                </Button>
              )}
              {pin && <CopyButton value={pin} label="Copy PIN" />}
            </div>
            {errors[card.id] && (
              <p className="mt-2 text-sm text-red-600">{errors[card.id]}</p>
            )}
            {revealed && card.pinFirstViewedAt && (
              <p className="mt-2 text-xs text-gray-500">
                {t('order.firstView')}: {formatWhen(card.pinFirstViewedAt)}
              </p>
            )}
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
