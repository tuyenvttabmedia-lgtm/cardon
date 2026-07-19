'use client';

import { createContext, useContext, useMemo, useState } from 'react';

export type FinanceDatePreset = 'today' | '7d' | 'month' | 'custom';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function presetRange(preset: FinanceDatePreset): { from: string; to: string } {
  const now = new Date();
  const to = formatDate(now);
  if (preset === 'today') {
    return { from: to, to };
  }
  if (preset === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { from: formatDate(start), to };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDate(start), to };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: formatDate(start), to };
}

interface FinanceDateContextValue {
  dateFrom: string;
  dateTo: string;
  preset: FinanceDatePreset;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  applyPreset: (preset: FinanceDatePreset) => void;
}

const FinanceDateContext = createContext<FinanceDateContextValue | null>(null);

export function FinanceDateProvider({ children }: { children: React.ReactNode }) {
  const initial = presetRange('month');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [preset, setPreset] = useState<FinanceDatePreset>('month');

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
          const range = presetRange(next);
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
