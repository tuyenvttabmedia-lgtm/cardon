'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { PartnerCard } from '@/types/api';

export function CardRevealPanel({ cards }: { cards: PartnerCard[] }) {
  const [visiblePins, setVisiblePins] = useState<Record<number, boolean>>({});

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Mã thẻ chỉ hiển thị khi giao dịch thành công. Không chia sẻ PIN.
      </p>
      {cards.map((card, index) => (
        <div
          key={`${card.card_serial}-${index}`}
          className="rounded-xl border border-slate-200 bg-slate-50 p-4"
        >
          <div>
            <p className="text-xs uppercase text-slate-500">Serial</p>
            <p className="font-mono text-sm font-semibold">{card.card_serial}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase text-slate-500">PIN</p>
              <p className="font-mono text-sm font-semibold">
                {visiblePins[index] ? card.card_pin : '••••••••'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setVisiblePins((prev) => ({ ...prev, [index]: !prev[index] }))
              }
            >
              {visiblePins[index] ? 'Ẩn PIN' : 'Hiện PIN'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
