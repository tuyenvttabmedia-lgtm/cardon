import {
  shiftVietnamDate,
  vietnamCalendarDate,
} from './vietnam-date';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export function resolveDatePreset(preset: DatePreset): { fromDate?: string; toDate?: string } {
  const today = vietnamCalendarDate();
  switch (preset) {
    case 'today':
      return { fromDate: today, toDate: today };
    case 'yesterday': {
      const day = shiftVietnamDate(today, -1);
      return { fromDate: day, toDate: day };
    }
    case 'last7':
      return { fromDate: shiftVietnamDate(today, -6), toDate: today };
    case 'thisMonth':
      return { fromDate: `${today.slice(0, 8)}01`, toDate: today };
    case 'lastMonth': {
      const end = shiftVietnamDate(`${today.slice(0, 8)}01`, -1);
      return { fromDate: `${end.slice(0, 8)}01`, toDate: end };
    }
    default:
      return {};
  }
}
