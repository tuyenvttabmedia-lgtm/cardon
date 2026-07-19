/** Vietnamese account center paths — keep navigation explicit (no router.back). */
export const ACCOUNT_BASE = '/tai-khoan';

export const ACCOUNT_PATHS = {
  profile: `${ACCOUNT_BASE}`,
  orders: `${ACCOUNT_BASE}/lich-su-giao-dich`,
  cards: `${ACCOUNT_BASE}/the-da-mua`,
  topups: `${ACCOUNT_BASE}/nap-cuoc`,
  data: `${ACCOUNT_BASE}/nap-data`,
  support: `${ACCOUNT_BASE}/ho-tro`,
  password: `${ACCOUNT_BASE}/doi-mat-khau`,
} as const;

export type AccountReturnFrom = 'orders' | 'cards' | 'topups' | 'data';

const RETURN_PATHS: Record<AccountReturnFrom, string> = {
  orders: ACCOUNT_PATHS.orders,
  cards: ACCOUNT_PATHS.cards,
  topups: ACCOUNT_PATHS.topups,
  data: ACCOUNT_PATHS.data,
};

export function orderDetailHref(orderId: string, from?: AccountReturnFrom): string {
  if (!from) return `/orders/${orderId}`;
  return `/orders/${orderId}?from=${from}`;
}

export function accountReturnPath(from: string | null | undefined): string {
  if (from && from in RETURN_PATHS) return RETURN_PATHS[from as AccountReturnFrom];
  return ACCOUNT_PATHS.orders;
}

export function isAccountPath(pathname: string): boolean {
  return pathname === ACCOUNT_BASE || pathname.startsWith(`${ACCOUNT_BASE}/`);
}

/** Top-level routes removed with customer.localhost — send to home, not /tai-khoan */
export const REMOVED_CUSTOMER_PORTAL_REDIRECTS: Record<string, string> = {
  '/dashboard': '/',
  '/orders': '/',
  '/pins': '/',
  '/notifications': '/',
  '/profile': '/',
  '/security': '/',
  '/support': '/',
};
