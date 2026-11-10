import {
  vietnamCalendarDate,
  vietnamDayBounds,
  shiftVietnamDate,
} from '../../../common/utils/vietnam-time.util';

export const DASHBOARD_PERIODS = ['today', 'last7', 'month'] as const;
export type DashboardPeriodPreset = (typeof DASHBOARD_PERIODS)[number];

export type DashboardPeriodRange = {
  preset: DashboardPeriodPreset;
  dateFrom: string;
  dateTo: string;
  fromInclusive: Date;
  toExclusive: Date;
  timezone: 'Asia/Ho_Chi_Minh';
};

export function normalizeDashboardPeriod(
  raw?: string | null,
): DashboardPeriodPreset {
  const value = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (value === 'last7' || value === 'month' || value === 'today') {
    return value;
  }
  return 'today';
}

/** Vietnam calendar bounds for cockpit period chips. Inclusive dateFrom/dateTo strings. */
export function resolveDashboardPeriodRange(
  raw?: string | null,
  now = new Date(),
): DashboardPeriodRange {
  const preset = normalizeDashboardPeriod(raw);
  const today = vietnamCalendarDate(now);

  let dateFrom = today;
  const dateTo = today;

  if (preset === 'last7') {
    dateFrom = shiftVietnamDate(today, -6);
  } else if (preset === 'month') {
    dateFrom = `${today.slice(0, 8)}01`;
  }

  const fromInclusive = vietnamDayBounds(dateFrom).start;
  const toExclusive = vietnamDayBounds(dateTo).endExclusive;

  return {
    preset,
    dateFrom,
    dateTo,
    fromInclusive,
    toExclusive,
    timezone: 'Asia/Ho_Chi_Minh',
  };
}
