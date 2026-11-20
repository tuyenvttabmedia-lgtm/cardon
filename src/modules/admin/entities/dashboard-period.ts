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

/** Previous window of the same length, ending the day before `range.dateFrom`. */
export function resolvePreviousDashboardPeriodRange(
  range: DashboardPeriodRange,
): Pick<
  DashboardPeriodRange,
  'dateFrom' | 'dateTo' | 'fromInclusive' | 'toExclusive' | 'timezone'
> {
  const dayCount =
    Math.round(
      (vietnamDayBounds(range.dateTo).start.getTime() -
        vietnamDayBounds(range.dateFrom).start.getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  const dateTo = shiftVietnamDate(range.dateFrom, -1);
  const dateFrom = shiftVietnamDate(dateTo, -(Math.max(dayCount, 1) - 1));
  return {
    dateFrom,
    dateTo,
    fromInclusive: vietnamDayBounds(dateFrom).start,
    toExclusive: vietnamDayBounds(dateTo).endExclusive,
    timezone: range.timezone,
  };
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}
