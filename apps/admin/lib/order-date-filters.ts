export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'thisMonth'
  | 'lastMonth'
  | 'custom';

export function resolveDatePreset(preset: DatePreset): { fromDate?: string; toDate?: string } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

  switch (preset) {
    case 'today': {
      const s = startOfDay(now);
      return { fromDate: toIsoDate(s), toDate: toIsoDate(s) };
    }
    case 'yesterday': {
      const y = startOfDay(now);
      y.setDate(y.getDate() - 1);
      return { fromDate: toIsoDate(y), toDate: toIsoDate(y) };
    }
    case 'last7': {
      const s = startOfDay(now);
      s.setDate(s.getDate() - 6);
      return { fromDate: toIsoDate(s), toDate: toIsoDate(now) };
    }
    case 'thisMonth': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { fromDate: toIsoDate(s), toDate: toIsoDate(now) };
    }
    case 'lastMonth': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0);
      return { fromDate: toIsoDate(s), toDate: toIsoDate(e) };
    }
    default:
      return {};
  }
}
