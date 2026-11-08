import {
  shiftVietnamDate,
  vietnamCalendarDate,
} from './vietnam-date';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom'
  | 'all';

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
    case 'last30':
      return { fromDate: shiftVietnamDate(today, -29), toDate: today };
    case 'thisMonth':
      return { fromDate: `${today.slice(0, 8)}01`, toDate: today };
    case 'lastMonth': {
      const end = shiftVietnamDate(`${today.slice(0, 8)}01`, -1);
      return { fromDate: `${end.slice(0, 8)}01`, toDate: end };
    }
    case 'all':
    case 'custom':
    default:
      return {};
  }
}

export function datePresetLabel(preset: DatePreset): string {
  switch (preset) {
    case 'today':
      return 'Hôm nay';
    case 'yesterday':
      return 'Hôm qua';
    case 'last7':
      return '7 ngày gần nhất';
    case 'last30':
      return '30 ngày gần nhất';
    case 'thisMonth':
      return 'Tháng này';
    case 'lastMonth':
      return 'Tháng trước';
    case 'custom':
      return 'Tùy chọn';
    case 'all':
      return 'Mọi thời gian';
    default:
      return preset;
  }
}
