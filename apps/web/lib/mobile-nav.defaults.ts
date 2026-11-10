export const DEFAULT_MOBILE_NAV = [
  { label: 'Trang chủ', icon: '🏠', url: '/', sortOrder: 0, active: true, navKey: 'nav.home' },
  { label: 'eSIM', icon: '📶', url: '/esim', sortOrder: 1, active: true, navKey: 'nav.esim' },
  { label: 'Thẻ game', icon: '🎮', url: '/the-game', sortOrder: 2, active: true, navKey: 'nav.game' },
  {
    label: 'Thẻ ĐT',
    icon: '📱',
    url: '/the-dien-thoai',
    sortOrder: 3,
    active: true,
    navKey: 'nav.phone',
  },
  { label: 'Nạp cước', icon: '⚡', url: '/nap-cuoc', sortOrder: 4, active: true, navKey: 'nav.topup' },
  {
    label: 'Tài khoản',
    icon: '👤',
    url: '/account',
    sortOrder: 5,
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
