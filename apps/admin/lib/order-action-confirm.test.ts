import { describe, expect, it } from 'vitest';
import { buildOrderActionConfirmCopy } from './order-action-confirm';

describe('buildOrderActionConfirmCopy (D2-A1)', () => {
  const base = {
    orderCode: 'ORD-TEST-1',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'NEED_MANUAL_REVIEW',
    retryLabel: 'Giao lại',
  };

  it('builds retry copy with order code and status', () => {
    const copy = buildOrderActionConfirmCopy({ ...base, kind: 'retry' });
    expect(copy.danger).toBe(false);
    expect(copy.title).toContain('Giao lại');
    expect(copy.lines.some((line) => line.includes('ORD-TEST-1'))).toBe(true);
    expect(copy.lines.some((line) => line.includes('PAID'))).toBe(true);
  });

  it('includes customer email for resend when provided and does not invent one', () => {
    const withEmail = buildOrderActionConfirmCopy({
      ...base,
      kind: 'resend_email',
      customerEmail: 'buyer@example.test',
    });
    expect(withEmail.lines.some((line) => line.includes('buyer@example.test'))).toBe(true);

    const withoutEmail = buildOrderActionConfirmCopy({ ...base, kind: 'resend_email' });
    expect(withoutEmail.lines.join(' ')).not.toMatch(/@/);
  });

  it('marks refund/switch/mark_fulfilled as danger and only shows known totals', () => {
    const refund = buildOrderActionConfirmCopy({
      ...base,
      kind: 'refund',
      orderTotalLabel: '103.000 ₫',
    });
    expect(refund.danger).toBe(true);
    expect(refund.lines.some((line) => line.includes('103.000 ₫'))).toBe(true);

    const refundNoAmount = buildOrderActionConfirmCopy({ ...base, kind: 'refund' });
    expect(refundNoAmount.lines.join(' ')).not.toMatch(/\d[\d.]*\s*₫/);

    expect(buildOrderActionConfirmCopy({ ...base, kind: 'switch_provider' }).danger).toBe(true);
    expect(buildOrderActionConfirmCopy({ ...base, kind: 'mark_fulfilled' }).danger).toBe(true);
  });
});
