import {
  vietnamCalendarDate,
  vietnamDayBounds,
  shiftVietnamDate,
} from '../../../common/utils/vietnam-time.util';

export const CUSTOMER_STATS_PERIODS = ['today', '7d', '30d', '90d'] as const;
export type CustomerStatsPeriodPreset = (typeof CUSTOMER_STATS_PERIODS)[number];

export type CustomerStatsPeriodRange = {
  preset: CustomerStatsPeriodPreset;
  dateFrom: string;
  dateTo: string;
  fromInclusive: Date;
  toExclusive: Date;
  timezone: 'Asia/Ho_Chi_Minh';
  dayCount: number;
};

const PRESET_DAYS: Record<CustomerStatsPeriodPreset, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

export function normalizeCustomerStatsPeriod(
  raw?: string | null,
): CustomerStatsPeriodPreset {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'today' || value === '7d' || value === '30d' || value === '90d') {
    return value;
  }
  return '30d';
}

/** Inclusive Vietnam calendar window ending today (ICT). */
export function resolveCustomerStatsPeriodRange(
  raw?: string | null,
  now = new Date(),
): CustomerStatsPeriodRange {
  const preset = normalizeCustomerStatsPeriod(raw);
  const dayCount = PRESET_DAYS[preset];
  const dateTo = vietnamCalendarDate(now);
  const dateFrom = shiftVietnamDate(dateTo, -(dayCount - 1));

  return {
    preset,
    dateFrom,
    dateTo,
    fromInclusive: vietnamDayBounds(dateFrom).start,
    toExclusive: vietnamDayBounds(dateTo).endExclusive,
    timezone: 'Asia/Ho_Chi_Minh',
    dayCount,
  };
}

/** Contiguous ICT dates from `dateFrom` through `dateTo` inclusive. */
export function enumerateVietnamDates(dateFrom: string, dateTo: string): string[] {
  const days: string[] = [];
  let cursor = dateFrom;
  for (let i = 0; i < 400; i += 1) {
    days.push(cursor);
    if (cursor === dateTo) break;
    cursor = shiftVietnamDate(cursor, 1);
    if (cursor > dateTo && days[days.length - 1] !== dateTo) {
      break;
    }
  }
  return days;
}
