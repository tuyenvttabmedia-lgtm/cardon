'use client';

import { useEffect, useState } from 'react';
import { PurchasedCardActions } from '@/components/account/PurchasedCardActions';
import { ListPagination } from '@/components/ui/ListPagination';
import { orderApi, accountApi } from '@/services/api-client';
import type { AccountCard } from '@/types/api';

const LIST_PAGE_SIZES = [10, 50, 100] as const;

export type PurchasedCardHomeService = 'GAME_CARD' | 'PHONE_CARD';

export function PurchasedCardsPanel({
  homeService,
  title,
  emptyLabel = 'Chưa có thẻ đã giao.',
}: {
  homeService: PurchasedCardHomeService;
  title: string;
  emptyLabel?: string;
}) {
  const [take, setTake] = useState<number>(LIST_PAGE_SIZES[0]);
  const [cards, setCards] = useState<AccountCard[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    void accountApi
      .listCards(skip, take, homeService)
      .then((result) => {
        setCards(result.items);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, [skip, take, homeService]);

  async function revealPin(card: AccountCard) {
    if (pins[card.cardId]) return;
    setLoadingId(card.cardId);
    setErrors((prev) => ({ ...prev, [card.cardId]: '' }));
    try {
      const result = await orderApi.revealPin(card.orderId, card.cardId);
      setPins((prev) => ({ ...prev, [card.cardId]: result.pin }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [card.cardId]: err instanceof Error ? err.message : 'Không thể hiển thị mã',
      }));
    } finally {
      setLoadingId(null);
    }
  }

  if (loading) return <p className="text-cardon-gray">Đang tải...</p>;

  return (
    <div className="min-w-0">
      <h2 className="text-lg font-bold text-cardon-navy">{title}</h2>
      <p className="mt-1 text-sm text-cardon-gray">
        Mã PIN được bảo vệ. Nhấn &quot;Xem mã&quot; để hiển thị — mọi lần xem đều được ghi nhận.
      </p>
      <div className="mt-4 space-y-3">
        {cards.length === 0 && <p className="text-cardon-gray">{emptyLabel}</p>}
        {cards.map((c) => {
          const pin = pins[c.cardId];
          const revealed = !!pin || c.pinViewCount > 0;
          return (
            <div key={c.cardId} className="min-w-0 overflow-hidden rounded-xl border border-gray-100 px-3 py-3 text-sm">
              <p className="font-semibold text-cardon-navy">{c.productName}</p>
              <p className="text-[11px] text-cardon-gray">Đơn: {c.orderCode}</p>
              <PurchasedCardActions
                serial={c.serial}
                pin={pin}
                revealLoading={loadingId === c.cardId}
                onReveal={() => void revealPin(c)}
                error={errors[c.cardId] || null}
                viewCountLabel={
                  revealed
                    ? `Đã xem ${c.pinViewCount > 0 ? `${c.pinViewCount} lần` : 'mã thẻ'}`
                    : null
                }
              />
            </div>
          );
        })}
      </div>
      <ListPagination
        skip={skip}
        take={take}
        total={total}
        onPageChange={setSkip}
        onPageSizeChange={setTake}
        pageSizeOptions={LIST_PAGE_SIZES}
        itemLabel="thẻ"
      />
    </div>
  );
}
