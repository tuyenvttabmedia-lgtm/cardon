import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, canAccessNavItem, type NavItem } from './permissions';

const paymentsItem = NAV_ITEMS.find((item) => item.href === '/payments');
const providersItem = NAV_ITEMS.find((item) => item.href === '/providers');
const staffItem = NAV_ITEMS.find((item) => item.href === '/staff');

describe('canAccessNavItem — payments navigation (D2-A3)', () => {
  it('exposes the /payments nav item in NAV_ITEMS', () => {
    expect(paymentsItem).toBeDefined();
    expect(paymentsItem?.permission).toBe('payments.view');
    expect(paymentsItem?.visibleForRoles).toEqual(['SUPPORT', 'ACCOUNTANT']);
  });

  it('shows /payments to SUPER_ADMIN even when visibleForRoles omits SUPER_ADMIN', () => {
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view'], 'SUPER_ADMIN'),
    ).toBe(true);
    expect(canAccessNavItem(paymentsItem as NavItem, [], 'SUPER_ADMIN')).toBe(true);
  });

  it('shows /payments to SUPPORT and ACCOUNTANT when they have payments.view', () => {
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view'], 'SUPPORT'),
    ).toBe(true);
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view'], 'ACCOUNTANT'),
    ).toBe(true);
  });

  it('hides /payments from SUPPORT/ACCOUNTANT without payments.view', () => {
    expect(canAccessNavItem(paymentsItem as NavItem, [], 'SUPPORT')).toBe(false);
    expect(canAccessNavItem(paymentsItem as NavItem, [], 'ACCOUNTANT')).toBe(false);
  });

  it('hides /payments from MARKETING (role allowlist + visibleForRoles)', () => {
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view', 'cms.manage'], 'MARKETING'),
    ).toBe(false);
  });

  it('does not open providers to ACCOUNTANT via the SUPER_ADMIN bypass fix', () => {
    expect(providersItem).toBeDefined();
    expect(
      canAccessNavItem(providersItem as NavItem, ['finance.view'], 'ACCOUNTANT'),
    ).toBe(false);
  });

  it('still restricts staff nav via item.roles for non-admin roles', () => {
    expect(staffItem).toBeDefined();
    expect(
      canAccessNavItem(staffItem as NavItem, ['users.manage'], 'SUPPORT'),
    ).toBe(false);
    expect(
      canAccessNavItem(staffItem as NavItem, ['users.manage'], 'SUPER_ADMIN'),
    ).toBe(true);
  });
});
