import type { MessageKey } from '@/lib/i18n/messages';
import { ACCOUNT_PATHS } from '@/lib/account-routes';

export type AccountNavLink = {
  href: string;
  labelKey: MessageKey;
  icon: string;
  requiresData?: boolean;
};

/** Shared account-center destinations (desktop sidebar + mobile sheet/select). */
export const ACCOUNT_NAV_LINKS: AccountNavLink[] = [
  { href: ACCOUNT_PATHS.profile, labelKey: 'account.profile', icon: '👤' },
  { href: ACCOUNT_PATHS.orders, labelKey: 'account.orders', icon: '📋' },
  { href: ACCOUNT_PATHS.gameCards, labelKey: 'account.gameCards', icon: '🎮' },
  { href: ACCOUNT_PATHS.phoneCards, labelKey: 'account.phoneCards', icon: '📱' },
  { href: ACCOUNT_PATHS.esim, labelKey: 'account.esim', icon: '📶' },
  { href: ACCOUNT_PATHS.topups, labelKey: 'account.topups', icon: '⚡' },
  { href: ACCOUNT_PATHS.data, labelKey: 'account.data', icon: '📶', requiresData: true },
  { href: ACCOUNT_PATHS.support, labelKey: 'nav.help', icon: '🎧' },
  { href: ACCOUNT_PATHS.password, labelKey: 'account.passwordTitle', icon: '🔒' },
];

export function isAccountNavActive(pathname: string, href: string): boolean {
  if (href === ACCOUNT_PATHS.profile) {
    return pathname === ACCOUNT_PATHS.profile || pathname === '/account';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
