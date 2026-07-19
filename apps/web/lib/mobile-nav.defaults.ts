export const DEFAULT_MOBILE_NAV = [
  { label: 'Trang chủ', icon: '🏠', url: '/', sortOrder: 0, active: true },
  { label: 'Mua thẻ', icon: '🛒', url: '/', sortOrder: 1, active: true },
  { label: 'Nạp cước', icon: '⚡', url: '/nap-cuoc', sortOrder: 2, active: true },
  { label: 'Data', icon: '📶', url: '/nap-data', sortOrder: 3, active: true },
  {
    label: 'Tài khoản',
    icon: '👤',
    url: '/account',
    sortOrder: 4,
    requireLogin: true,
    active: true,
  },
] as const;

export type MobileNavItem = {
  label: string;
  icon: string;
  url: string;
  sortOrder: number;
  requireLogin?: boolean;
  active?: boolean;
};
