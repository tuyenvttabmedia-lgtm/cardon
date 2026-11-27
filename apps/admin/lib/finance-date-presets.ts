import { shiftVietnamDate, vietnamCalendarDate } from './vietnam-date';

export type FinanceDatePreset =
  | 'today'
  | 'yesterday'
  | '7d'
  | 'month'
  | 'lastMonth'
  | 'custom';

export type FinanceQuickPreset = Exclude<FinanceDatePreset, 'custom'>;

export function financePresetRange(preset: FinanceQuickPreset): { from: string; to: string } {
  const today = vietnamCalendarDate();
  if (preset === 'today') {
    return { from: today, to: today };
  }
  if (preset === 'yesterday') {
    const day = shiftVietnamDate(today, -1);
    return { from: day, to: day };
  }
  if (preset === '7d') {
    return { from: shiftVietnamDate(today, -6), to: today };
  }
  if (preset === 'lastMonth') {
    const end = shiftVietnamDate(`${today.slice(0, 8)}01`, -1);
    return { from: `${end.slice(0, 8)}01`, to: end };
  }
  const start = `${today.slice(0, 8)}01`;
  return { from: start, to: today };
}

/** Đối soát eSale + HĐ đầu ra bán lẻ: mặc định Hôm qua. */
export function isFinanceYesterdayDefaultPath(pathname: string): boolean {
  return (
    pathname === '/finance/supplier' ||
    pathname.startsWith('/finance/supplier/') ||
    pathname === '/finance/retail' ||
    pathname.startsWith('/finance/retail/')
  );
}

export function financeDefaultPresetForPath(pathname: string): FinanceQuickPreset {
  return isFinanceYesterdayDefaultPath(pathname) ? 'yesterday' : 'month';
}
