import { describe, expect, it } from 'vitest';
import {
  NAV_GROUPS,
  NAV_ITEMS,
  canAccessNavItem,
  isNavItemActive,
  normalizeNavSearch,
  resolveActiveNavHref,
  type NavItem,
} from './permissions';

const paymentsItem = NAV_ITEMS.find((item) => item.href === '/payments');
const providersItem = NAV_ITEMS.find((item) => item.href === '/providers');
const staffItem = NAV_ITEMS.find((item) => item.href === '/staff');
const productsItem = NAV_ITEMS.find((item) => item.href === '/products');
const productsEsimItem = NAV_ITEMS.find((item) => item.href === '/products/esim');
const ordersItem = NAV_ITEMS.find((item) => item.href === '/orders');
const ordersAgentItem = NAV_ITEMS.find((item) => item.href === '/orders/agent');
const financeItem = NAV_ITEMS.find((item) => item.href === '/finance/supplier');
const refundsItem = NAV_ITEMS.find((item) => item.href === '/refunds');
const agentsItem = NAV_ITEMS.find((item) => item.href === '/agents/overview');
const operationsItem = NAV_ITEMS.find((item) => item.href === '/operations');
const configurationItem = NAV_ITEMS.find((item) => item.href === '/configuration');

describe('canAccessNavItem — payments navigation (D2-A3 / D2-B2)', () => {
  it('exposes the /payments nav item in NAV_ITEMS', () => {
    expect(paymentsItem).toBeDefined();
    expect(paymentsItem?.permission).toBe('payments.view');
    expect(paymentsItem?.visibleForRoles).toEqual(['SUPPORT', 'ACCOUNTANT', 'ADMIN']);
    expect(paymentsItem?.group).toBe('finance');
  });

  it('shows /payments to SUPER_ADMIN even when visibleForRoles omits SUPER_ADMIN', () => {
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view'], 'SUPER_ADMIN'),
    ).toBe(true);
    expect(canAccessNavItem(paymentsItem as NavItem, [], 'SUPER_ADMIN')).toBe(true);
  });

  it('shows /payments to ADMIN when they have payments.view (D2-B2)', () => {
    expect(
      canAccessNavItem(paymentsItem as NavItem, ['payments.view'], 'ADMIN'),
    ).toBe(true);
  });

  it('hides /payments from ADMIN without payments.view', () => {
    expect(canAccessNavItem(paymentsItem as NavItem, [], 'ADMIN')).toBe(false);
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

describe('isNavItemActive — D2-B2 match modes', () => {
  it('keeps /products and /products/esim mutually exclusive', () => {
    expect(isNavItemActive('/products', productsItem as NavItem)).toBe(true);
    expect(isNavItemActive('/products', productsEsimItem as NavItem)).toBe(false);
    expect(isNavItemActive('/products/esim', productsItem as NavItem)).toBe(false);
    expect(isNavItemActive('/products/esim', productsEsimItem as NavItem)).toBe(true);
    expect(isNavItemActive('/products/esim/x', productsEsimItem as NavItem)).toBe(true);
  });

  it('does not mark retail orders active on /orders/agent', () => {
    expect(isNavItemActive('/orders', ordersItem as NavItem)).toBe(true);
    expect(isNavItemActive('/orders/agent', ordersItem as NavItem)).toBe(false);
    expect(isNavItemActive('/orders/agent', ordersAgentItem as NavItem)).toBe(true);
    expect(
      isNavItemActive('/orders/550e8400-e29b-41d4-a716-446655440000', ordersItem as NavItem),
    ).toBe(true);
  });

  it('keeps finance hub active on /finance/* but not /refunds or /payments', () => {
    expect(isNavItemActive('/finance/supplier', financeItem as NavItem)).toBe(true);
    expect(isNavItemActive('/finance/esim', financeItem as NavItem)).toBe(true);
    expect(isNavItemActive('/refunds', financeItem as NavItem)).toBe(false);
    expect(isNavItemActive('/payments', financeItem as NavItem)).toBe(false);
    expect(isNavItemActive('/refunds', refundsItem as NavItem)).toBe(true);
  });

  it('keeps agents / operations / configuration hubs active on child routes', () => {
    expect(isNavItemActive('/agents/list', agentsItem as NavItem)).toBe(true);
    expect(isNavItemActive('/agents/kyc', agentsItem as NavItem)).toBe(true);
    expect(isNavItemActive('/operations/exceptions', operationsItem as NavItem)).toBe(true);
    expect(isNavItemActive('/configuration/health', configurationItem as NavItem)).toBe(true);
  });

  it('places agent orders in commerce group and agents hub separately', () => {
    expect(ordersAgentItem?.group).toBe('commerce');
    expect(agentsItem?.group).toBe('agents');
    expect(refundsItem?.group).toBe('finance');
  });
});

describe('D2-B2 UI refinement — short groups + mapping', () => {
  it('uses short group labels that fit without ellipsis', () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual([
      'Tổng quan',
      'BÁN HÀNG',
      'TÀI CHÍNH',
      'ĐẠI LÝ',
      'VẬN HÀNH',
      'GIÁM SÁT',
      'QUẢN TRỊ',
    ]);
    expect(NAV_GROUPS.find((g) => g.id === 'overview')?.hideHeader).toBe(true);
  });

  it('maps Marketing to BÁN HÀNG and Support to VẬN HÀNH', () => {
    expect(NAV_ITEMS.find((i) => i.href === '/marketing')?.group).toBe('commerce');
    expect(NAV_ITEMS.find((i) => i.href === '/support/tickets')?.group).toBe('ops');
    expect(ordersItem?.label).toBe('Đơn bán lẻ');
    expect(agentsItem?.label).toBe('Quản lý đại lý');
  });

  it('requires an icon on every nav item', () => {
    for (const item of NAV_ITEMS) {
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('resolveActiveNavHref — exclusive active (Sidebar UX v2)', () => {
  it('activates staff not dashboard on /staff', () => {
    expect(resolveActiveNavHref('/staff', NAV_ITEMS)).toBe('/staff');
    expect(isNavItemActive('/staff', NAV_ITEMS.find((i) => i.href === '/dashboard') as NavItem)).toBe(
      false,
    );
  });

  it('covers product / finance / agents / ops / config matrices', () => {
    expect(resolveActiveNavHref('/dashboard', NAV_ITEMS)).toBe('/dashboard');
    expect(resolveActiveNavHref('/products', NAV_ITEMS)).toBe('/products');
    expect(resolveActiveNavHref('/products/esim', NAV_ITEMS)).toBe('/products/esim');
    expect(resolveActiveNavHref('/payments', NAV_ITEMS)).toBe('/payments');
    expect(resolveActiveNavHref('/refunds', NAV_ITEMS)).toBe('/refunds');
    expect(resolveActiveNavHref('/finance/esim', NAV_ITEMS)).toBe('/finance/supplier');
    expect(resolveActiveNavHref('/agents/kyc', NAV_ITEMS)).toBe('/agents/overview');
    expect(resolveActiveNavHref('/operations/exceptions', NAV_ITEMS)).toBe('/operations');
    expect(resolveActiveNavHref('/configuration/health', NAV_ITEMS)).toBe('/configuration');
  });

  it('returns null for unmapped routes (no dashboard fallback)', () => {
    expect(resolveActiveNavHref('/account', NAV_ITEMS)).toBeNull();
    expect(resolveActiveNavHref('/unknown-route', NAV_ITEMS)).toBeNull();
  });

  it('normalizes Vietnamese accents for search', () => {
    expect(normalizeNavSearch('Tài chính')).toBe('tai chinh');
    expect(normalizeNavSearch('ĐẠI LÝ').includes(normalizeNavSearch('dai ly'))).toBe(true);
  });
});
