import { PaypalFeeMatchStatus, PaypalReportLineKind } from '@prisma/client';
import { buildPaypalFeeMatchDrafts } from '../entities/paypal-fee-match.engine';

describe('F3-B financial integrity (pure)', () => {
  it('never treats payout as MATCHED revenue', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [
        {
          id: 'w1',
          kind: PaypalReportLineKind.PAYOUT_OR_BALANCE,
          paypalTxnId: 'W1',
          customId: null,
          gross: '50.00',
          fee: '0.00',
          net: '50.00',
          currency: 'USD',
        },
      ],
      payments: [
        {
          id: 'p1',
          paymentReference: 'PAY-1',
          gatewayTransactionId: 'CAP1',
          amount: '10.00',
          currency: 'USD',
          feeEstimated: '0.00',
          paidAt: new Date(),
        },
      ],
      duplicateTxnIds: new Set(),
      existingActiveByPaymentId: new Map(),
      existingActiveByCaptureId: new Map(),
    });
    expect(drafts.find((d) => d.reportLineId === 'w1')?.matchStatus).toBe(
      PaypalFeeMatchStatus.NON_SALE,
    );
    expect(drafts.some((d) => d.matchStatus === PaypalFeeMatchStatus.MATCHED)).toBe(false);
  });

  it('keeps estimated fee separate from actual fee on MATCHED', () => {
    const drafts = buildPaypalFeeMatchDrafts({
      lines: [
        {
          id: 'l1',
          kind: PaypalReportLineKind.SALE_CAPTURE,
          paypalTxnId: 'CAP1',
          customId: 'PAY-1',
          gross: '10.00',
          fee: '0.49',
          net: '9.51',
          currency: 'USD',
        },
      ],
      payments: [
        {
          id: 'p1',
          paymentReference: 'PAY-1',
          gatewayTransactionId: 'CAP1',
          amount: '10.00',
          currency: 'USD',
          feeEstimated: '0.00',
          paidAt: new Date(),
        },
      ],
      duplicateTxnIds: new Set(),
      existingActiveByPaymentId: new Map(),
      existingActiveByCaptureId: new Map(),
    });
    const m = drafts.find((d) => d.matchStatus === PaypalFeeMatchStatus.MATCHED);
    expect(m?.feeEstimated).toBe('0.00');
    expect(m?.feeActual).toBe('0.49');
    expect(m?.feeEstimated).not.toBe(m?.feeActual);
  });
});
