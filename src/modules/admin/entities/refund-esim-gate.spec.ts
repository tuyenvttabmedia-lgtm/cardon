import { RefundEsimGate } from '@prisma/client';
import { resolveRefundEsimGate } from './refund-esim-gate';

describe('refund eSIM safety gate', () => {
  it('returns NONE when there is no eSIM risk signal', () => {
    expect(
      resolveRefundEsimGate({
        hasProfile: false,
        hasLpaRevealAudit: false,
        attempts: [],
      }),
    ).toBe(RefundEsimGate.NONE);
  });

  it('returns CREATE_UNCLEAR for CREATE UNCONFIRMED', () => {
    expect(
      resolveRefundEsimGate({
        hasProfile: false,
        hasLpaRevealAudit: false,
        attempts: [
          {
            operation: 'CREATE',
            outcome: 'UNCONFIRMED',
            providerReference: null,
            openGuard: 'item-1',
          },
        ],
      }),
    ).toBe(RefundEsimGate.CREATE_UNCLEAR);
  });

  it('returns HAS_REFERENCE over CREATE_UNCLEAR', () => {
    expect(
      resolveRefundEsimGate({
        hasProfile: false,
        hasLpaRevealAudit: false,
        attempts: [
          { operation: 'CREATE', outcome: 'UNCONFIRMED', openGuard: 'item-1' },
          {
            operation: 'CREATE',
            outcome: 'CONFIRMED_CREATED',
            providerReference: '104158',
          },
        ],
      }),
    ).toBe(RefundEsimGate.HAS_REFERENCE);
  });

  it('returns ISSUED over HAS_REFERENCE and CREATE_UNCLEAR when a profile exists', () => {
    expect(
      resolveRefundEsimGate({
        hasProfile: true,
        hasLpaRevealAudit: false,
        attempts: [
          {
            operation: 'CREATE',
            outcome: 'CONFIRMED_CREATED',
            providerReference: '104158',
          },
        ],
      }),
    ).toBe(RefundEsimGate.ISSUED);
  });

  it('returns ISSUED from LPA reveal audit even without a profile row', () => {
    expect(
      resolveRefundEsimGate({
        hasProfile: false,
        hasLpaRevealAudit: true,
        attempts: [],
      }),
    ).toBe(RefundEsimGate.ISSUED);
  });
});
