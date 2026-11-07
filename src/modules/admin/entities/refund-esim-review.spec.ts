import { RefundEsimGate } from '@prisma/client';
import {
  buildClearedEsimReviewEvidence,
  canExecuteEsimGate,
  isEsimReviewCleared,
} from './refund-esim-review';

describe('refund eSIM review evidence', () => {
  it('blocks non-NONE gates until a cleared review is stored', () => {
    expect(canExecuteEsimGate(RefundEsimGate.NONE, {})).toBe(true);
    expect(canExecuteEsimGate(RefundEsimGate.ISSUED, {})).toBe(false);
    expect(canExecuteEsimGate(RefundEsimGate.HAS_REFERENCE, { esimReviewCleared: true })).toBe(
      false,
    );
    const cleared = buildClearedEsimReviewEvidence({}, 'admin-1', new Date('2026-10-28T00:00:00Z'));
    expect(isEsimReviewCleared(cleared)).toBe(true);
    expect(canExecuteEsimGate(RefundEsimGate.CREATE_UNCLEAR, cleared)).toBe(true);
  });

  it('does not treat fulfillment FAILED as a review clear', () => {
    expect(
      canExecuteEsimGate(RefundEsimGate.ISSUED, { fulfillmentStatus: 'FAILED' }),
    ).toBe(false);
  });
});
