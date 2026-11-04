import { RefundAttemptStatus, RefundIntendedMethod } from '@prisma/client';
import {
  assertMaskedDestinationHint,
  BLOCKED_REFUND_METHODS,
  buildExecuteFingerprint,
  executeFingerprintsMatch,
  hasSuccessfulTransferEvidence,
  isExecutableRefundMethod,
  normalizeIdempotencyKey,
} from './refund-payout.rules';

describe('refund payout rules', () => {
  it('allows only BANK_PAYOUT and MANUAL_OTHER', () => {
    expect(isExecutableRefundMethod(RefundIntendedMethod.BANK_PAYOUT)).toBe(true);
    expect(isExecutableRefundMethod(RefundIntendedMethod.MANUAL_OTHER)).toBe(true);
    expect(isExecutableRefundMethod(RefundIntendedMethod.SEPAY_PG_VOID)).toBe(false);
    expect(isExecutableRefundMethod(RefundIntendedMethod.PAYPAL_REFUND)).toBe(false);
    expect(BLOCKED_REFUND_METHODS.has(RefundIntendedMethod.SEPAY_PG_REFUND)).toBe(true);
  });

  it('accepts a masked destination hint and rejects a full account number', () => {
    expect(assertMaskedDestinationHint('VCB ****1234 · NGUYEN V*')).toBe(
      'VCB ****1234 · NGUYEN V*',
    );
    expect(() => assertMaskedDestinationHint('VCB 123456789')).toThrow(
      'DESTINATION_HINT_FULL_ACCOUNT',
    );
    expect(() => assertMaskedDestinationHint('VCB 1234 NGUYEN VAN')).toThrow(
      'DESTINATION_HINT_NOT_MASKED',
    );
  });

  it('treats SUCCEEDED or stored bank evidence as successful transfer', () => {
    expect(
      hasSuccessfulTransferEvidence({
        status: RefundAttemptStatus.SENT,
        bankTransactionReference: 'FT123',
        transferredAt: new Date(),
      }),
    ).toBe(true);
    expect(
      hasSuccessfulTransferEvidence({
        status: RefundAttemptStatus.SENT,
        bankTransactionReference: null,
        transferredAt: null,
      }),
    ).toBe(false);
  });

  it('matches execute fingerprints for idempotent replay', () => {
    const left = buildExecuteFingerprint({
      requestId: 'req-1',
      amount: '100.00',
      currency: 'VND',
      method: 'BANK_PAYOUT',
    });
    const right = buildExecuteFingerprint({
      requestId: 'req-1',
      amount: '100',
      currency: 'VND',
      method: 'BANK_PAYOUT',
    });
    expect(executeFingerprintsMatch(left, right)).toBe(true);
    expect(normalizeIdempotencyKey('  key-1  ')).toBe('key-1');
  });
});
