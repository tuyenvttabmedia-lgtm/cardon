'use client';

import { useMemo, useState } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';
import { ListPagination } from '@/components/ui/ListPagination';
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
        [card.id]: err instanceof Error ? err.message : 'Không thể hiển thị mã',
      }));
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Mã PIN được bảo vệ. Nhấn &quot;Xem mã&quot; để hiển thị — mọi lần xem đều được ghi nhận.
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
                <p className="text-xs uppercase tracking-wide text-gray-500">Mã thẻ</p>
                <p className="font-mono text-sm font-semibold">{pin ?? card.pinMasked}</p>
              </div>
              {!pin && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void revealPin(card)}
                  disabled={loadingId === card.id}
                >
                  {loadingId === card.id ? 'Đang tải...' : 'Xem mã'}
                </Button>
              )}
              {pin && <CopyButton value={pin} label="Copy PIN" />}
            </div>
            {errors[card.id] && (
              <p className="mt-2 text-sm text-red-600">{errors[card.id]}</p>
            )}
            {revealed && card.pinFirstViewedAt && (
              <p className="mt-2 text-xs text-gray-500">
                Lần xem đầu: {new Date(card.pinFirstViewedAt).toLocaleString('vi-VN')}
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
        itemLabel="thẻ"
      />
    </div>
  );
}
