'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import {
  financePresetRange,
  type FinanceDatePreset,
  type FinanceQuickPreset,
} from '@/lib/finance-date-presets';

export type { FinanceDatePreset, FinanceQuickPreset };
export {
  financeDefaultPresetForPath,
  financePresetRange,
  isFinanceYesterdayDefaultPath,
} from '@/lib/finance-date-presets';

interface FinanceDateContextValue {
  dateFrom: string;
  dateTo: string;
  preset: FinanceDatePreset;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  applyPreset: (preset: FinanceDatePreset) => void;
}

const FinanceDateContext = createContext<FinanceDateContextValue | null>(null);

export function FinanceDateProvider({
  children,
  initialPreset = 'month',
}: {
  children: React.ReactNode;
  initialPreset?: FinanceQuickPreset;
}) {
  const initial = financePresetRange(initialPreset);
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [preset, setPreset] = useState<FinanceDatePreset>(initialPreset);

  const value = useMemo(
    () => ({
      dateFrom,
      dateTo,
      preset,
      setDateFrom: (v: string) => {
        setPreset('custom');
        setDateFrom(v);
      },
      setDateTo: (v: string) => {
        setPreset('custom');
        setDateTo(v);
      },
      applyPreset: (next: FinanceDatePreset) => {
        setPreset(next);
        if (next !== 'custom') {
          const range = financePresetRange(next);
          setDateFrom(range.from);
          setDateTo(range.to);
        }
      },
    }),
    [dateFrom, dateTo, preset],
  );

  return <FinanceDateContext.Provider value={value}>{children}</FinanceDateContext.Provider>;
}

export function useFinanceDates() {
  const ctx = useContext(FinanceDateContext);
  if (!ctx) {
    throw new Error('useFinanceDates must be used within FinanceDateProvider');
  }
  return ctx;
}
