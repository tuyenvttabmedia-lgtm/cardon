'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export const DEFAULT_MAX_QUANTITY = 999;

function clampQuantity(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function QuantityInput({
  value,
  onChange,
  min = 1,
  max = DEFAULT_MAX_QUANTITY,
  className,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
  /** Smaller controls for sticky mobile pay bar. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit(raw: string) {
    const parsed = parseInt(raw, 10);
    const next = Number.isFinite(parsed) ? clampQuantity(parsed, min, max) : min;
    onChange(next);
    setDraft(String(next));
  }

  const btnClass = compact
    ? 'flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-base font-bold hover:bg-gray-50 disabled:opacity-40'
    : 'flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-xl font-bold hover:bg-gray-50 disabled:opacity-40';
  const inputClass = compact
    ? 'h-8 w-11 rounded-md border border-gray-200 text-center text-sm font-bold text-cardon-navy outline-none focus:border-cardon-blue'
    : 'h-10 w-16 rounded-lg border border-gray-200 text-center text-lg font-bold text-cardon-navy outline-none focus:border-cardon-blue';

  return (
    <div className={cn('flex items-center', compact ? 'gap-1' : 'gap-2', className)}>
      <button
        type="button"
        aria-label="Giảm số lượng"
        className={btnClass}
        disabled={value <= min}
        onClick={() => onChange(clampQuantity(value - 1, min, max))}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label="Số lượng"
        value={draft}
        className={inputClass}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          }
        }}
      />
      <button
        type="button"
        aria-label="Tăng số lượng"
        className={btnClass}
        disabled={value >= max}
        onClick={() => onChange(clampQuantity(value + 1, min, max))}
      >
        +
      </button>
    </div>
  );
}
