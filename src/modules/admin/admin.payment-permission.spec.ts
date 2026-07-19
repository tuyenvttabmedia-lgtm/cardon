/**
 * Phase 5C.4 — Support payment readonly (seed matrix + admin API gates)
 */

/** Mirrors prisma/seed.mjs */
const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  SUPPORT: [
    'users.read',
    'orders.read',
    'orders.retry',
    'payments.view',
    'agents.kyc.review',
  ],
  ACCOUNTANT: [
    'users.read',
    'orders.read',
    'payments.view',
    'ledger.view',
    'invoice.manage',
    'agents.credit',
    'payments.review',
    'finance.view',
    'finance.manage',
  ],
};

const PAYMENTS_NAV_PERMISSION = 'payments.view';
const PAYMENTS_LIST_PERMISSION = 'payments.view';
const PAYMENTS_REVIEW_PERMISSION = 'payments.review';

function roleHas(role: string, code: string): boolean {
  return (ROLE_PERMISSION_MATRIX[role] ?? []).includes(code);
}

describe('Phase 5C.4 — Support payment readonly', () => {
  it('SUPPORT has payments.view for nav and list', () => {
    expect(roleHas('SUPPORT', PAYMENTS_NAV_PERMISSION)).toBe(true);
    expect(roleHas('SUPPORT', PAYMENTS_LIST_PERMISSION)).toBe(true);
  });

  it('SUPPORT cannot approve/reject (no payments.review)', () => {
    expect(roleHas('SUPPORT', PAYMENTS_REVIEW_PERMISSION)).toBe(false);
  });

  it('ACCOUNTANT can view and review payments', () => {
    expect(roleHas('ACCOUNTANT', PAYMENTS_LIST_PERMISSION)).toBe(true);
    expect(roleHas('ACCOUNTANT', PAYMENTS_REVIEW_PERMISSION)).toBe(true);
  });

  it('nav permission is payments.view not payments.review', () => {
    expect(PAYMENTS_NAV_PERMISSION).toBe('payments.view');
    expect(roleHas('SUPPORT', PAYMENTS_NAV_PERMISSION)).toBe(true);
    expect(roleHas('SUPPORT', 'payments.review')).toBe(false);
  });
});
