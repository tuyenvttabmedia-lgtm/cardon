'use client';

import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';
import { ListPagination } from '@/components/ui/ListPagination';
import { orderApi, accountApi } from '@/services/api-client';
import type { AccountCard } from '@/types/api';

const LIST_PAGE_SIZES = [10, 50, 100] as const;

export default function AccountCardsPage() {
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
      .listCards(skip, take)
      .then((result) => {
        setCards(result.items);
        setTotal(result.total);
      })
      .finally(() => setLoading(false));
  }, [skip, take]);

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
    <div>
      <h2 className="text-lg font-bold text-cardon-navy">Thẻ đã mua</h2>
      <p className="mt-1 text-sm text-cardon-gray">
        Mã PIN được bảo vệ. Nhấn &quot;Xem mã&quot; để hiển thị — mọi lần xem đều được ghi nhận.
      </p>
      <div className="mt-4 space-y-3">
        {cards.length === 0 && <p className="text-cardon-gray">Chưa có thẻ đã giao.</p>}
        {cards.map((c) => {
          const pin = pins[c.cardId];
          const revealed = !!pin || c.pinViewCount > 0;
          return (
            <div key={c.cardId} className="rounded-xl border border-gray-100 p-4 text-sm">
              <p className="font-semibold text-cardon-navy">{c.productName}</p>
              <p className="text-xs text-cardon-gray">Đơn: {c.orderCode}</p>
              <div className="mt-3 space-y-3 font-mono text-xs md:text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="text-cardon-gray">SERIAL:</span>{' '}
                    <span className="font-semibold">{c.serial}</span>
                  </p>
                  <CopyButton value={c.serial} label="Copy serial" />
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <p>
                    <span className="text-cardon-gray">MÃ THẺ:</span>{' '}
                    <span className="font-semibold">{pin ?? '************'}</span>
                  </p>
                  {!pin && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void revealPin(c)}
                      disabled={loadingId === c.cardId}
                    >
                      {loadingId === c.cardId ? 'Đang tải...' : 'Xem mã'}
                    </Button>
                  )}
                  {pin && <CopyButton value={pin} label="Copy PIN" />}
                </div>
              </div>
              {errors[c.cardId] && (
                <p className="mt-2 text-sm text-red-600">{errors[c.cardId]}</p>
              )}
              {revealed && (
                <p className="mt-2 text-xs text-cardon-gray">
                  Đã xem {c.pinViewCount > 0 ? `${c.pinViewCount} lần` : 'mã thẻ'}
                </p>
              )}
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
