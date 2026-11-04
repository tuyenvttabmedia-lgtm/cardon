import { describe, expect, it } from 'vitest';
import {
  validateCompleteRefundForm,
  visibleRefundActions,
} from './refund-admin-actions';

const base = {
  status: 'APPROVED',
  esimGate: 'NONE',
  requiresManualReview: false,
  remainingOnRequest: '100000.00',
  latestAttempt: null,
};

describe('visibleRefundActions', () => {
  it('shows approve only with refund.approve', () => {
    const requested = { ...base, status: 'REQUESTED' };
    expect(visibleRefundActions(['refund.request'], 'SUPPORT', requested)).toEqual([
      'request',
      'cancel',
    ]);
    expect(
      visibleRefundActions(['refund.approve'], 'ACCOUNTANT', requested),
    ).toContain('approve');
    expect(
      visibleRefundActions(['refund.execute'], 'ADMIN', requested),
    ).not.toContain('approve');
  });

  it('shows execute/complete/reconcile only with matching permission', () => {
    expect(visibleRefundActions(['refund.execute'], 'ADMIN', base)).toContain('execute');
    expect(visibleRefundActions(['refund.request'], 'SUPPORT', base)).not.toContain(
      'execute',
    );
    const open = {
      ...base,
      status: 'PROCESSING',
      latestAttempt: {
        id: 'a1',
        status: 'SENT',
        reconStatus: 'PENDING_VERIFY',
        isOpen: true,
      },
    };
    expect(visibleRefundActions(['refund.execute'], 'ADMIN', open)).toEqual(
      expect.arrayContaining(['complete', 'fail', 'unconfirm']),
    );
    const succeeded = {
      ...base,
      status: 'SUCCEEDED',
      remainingOnRequest: '0.00',
      latestAttempt: {
        id: 'a1',
        status: 'SUCCEEDED',
        reconStatus: 'PENDING_VERIFY',
        isOpen: false,
      },
    };
    expect(
      visibleRefundActions(['refund.reconcile'], 'ACCOUNTANT', succeeded),
    ).toEqual(expect.arrayContaining(['reconcileVerified', 'reconcileRejected']));
    expect(visibleRefundActions(['refund.execute'], 'ADMIN', succeeded)).not.toContain(
      'reconcileVerified',
    );
  });

  it('hides execute while eSIM review is required', () => {
    expect(
      visibleRefundActions(['refund.execute', 'refund.approve'], 'ADMIN', {
        ...base,
        esimGate: 'ISSUED',
        requiresManualReview: true,
      }),
    ).toEqual(expect.arrayContaining(['clearEsimReview']));
    expect(
      visibleRefundActions(['refund.execute', 'refund.approve'], 'ADMIN', {
        ...base,
        esimGate: 'ISSUED',
        requiresManualReview: true,
      }),
    ).not.toContain('execute');
  });
});

describe('validateCompleteRefundForm', () => {
  it('requires masked destination hint', () => {
    expect(
      validateCompleteRefundForm({
        bankTransactionReference: 'FT1',
        amount: '1000',
        currency: 'VND',
        transferredAt: '2026-10-01T00:00',
        destinationHint: '0123456789012',
      }),
    ).toMatch(/số tài khoản/);
    expect(
      validateCompleteRefundForm({
        bankTransactionReference: 'FT1',
        amount: '1000',
        currency: 'VND',
        transferredAt: '2026-10-01T00:00',
        destinationHint: 'VCB ****1234',
      }),
    ).toBeNull();
  });
});
