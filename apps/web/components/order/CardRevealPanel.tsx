'use client';

import { useState } from 'react';
import { CopyButton } from '@/components/ui/CopyButton';
import { Button } from '@/components/ui/Button';
import { useT } from '@/components/i18n/LocaleProvider';
import type { DeliveredCard } from '@/types/api';

export function CardRevealPanel({ cards }: { cards: DeliveredCard[] }) {
  const [visiblePins, setVisiblePins] = useState<Record<number, boolean>>({});
  const t = useT();

  function togglePin(index: number) {
    setVisiblePins((prev) => ({ ...prev, [index]: !prev[index] }));
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        {t('order.pinAfterPay')}
      </p>
      {cards.map((card, index) => (
        <div
          key={`${card.serial}-${index}`}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Serial</p>
              <p className="font-mono text-sm font-semibold">{card.serial}</p>
            </div>
            <CopyButton value={card.serial} label="Copy serial" />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">PIN</p>
              <p className="font-mono text-sm font-semibold">
                {visiblePins[index] ? card.pin ?? card.pinMasked ?? '••••••••' : '••••••••'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => togglePin(index)}
              >
                {visiblePins[index] ? t('order.hidePin') : t('order.showPin')}
              </Button>
              {card.pin && visiblePins[index] && (
                <CopyButton value={card.pin} label="Copy PIN" />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
