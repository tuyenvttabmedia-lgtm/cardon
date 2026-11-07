export const DEFAULT_MOBILE_NAV = [
  { label: 'Trang chủ', icon: '🏠', url: '/', sortOrder: 0, active: true, navKey: 'nav.home' },
  { label: 'Mua thẻ', icon: '🛒', url: '/', sortOrder: 1, active: true, navKey: 'nav.buyCards' },
  { label: 'Nạp cước', icon: '⚡', url: '/nap-cuoc', sortOrder: 2, active: true, navKey: 'nav.topup' },
  { label: 'Data', icon: '📶', url: '/nap-data', sortOrder: 3, active: true, navKey: 'nav.data' },
  {
    label: 'Tài khoản',
    icon: '👤',
    url: '/account',
    sortOrder: 4,
    requireLogin: true,
    active: true,
    navKey: 'nav.account',
  },
] as const;

export type MobileNavItem = {
  label: string;
  labelEn?: string;
  navKey?: string;
  icon: string;
  url: string;
  sortOrder: number;
  requireLogin?: boolean;
  active?: boolean;
};
