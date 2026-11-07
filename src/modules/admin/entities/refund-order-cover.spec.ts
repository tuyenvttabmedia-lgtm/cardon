import { evaluateOrderRefundCover, evaluatePaymentRefundCover } from './refund-order-cover';

describe('refund order cover', () => {
  const payment = { id: 'pay-1', amount: '100.00', status: 'SUCCESS' };

  it('requires verified succeeded cover equal to the collected amount', () => {
    const full = evaluatePaymentRefundCover(payment, [
      {
        paymentId: 'pay-1',
        amount: '100.00',
        status: 'SUCCEEDED',
        currency: 'VND',
        attempts: [
          { amount: '100.00', status: 'SUCCEEDED', reconStatus: 'VERIFIED' },
        ],
      },
    ]);
    expect(full.fullyCovered).toBe(true);

    const pending = evaluatePaymentRefundCover(payment, [
      {
        paymentId: 'pay-1',
        amount: '100.00',
        status: 'SUCCEEDED',
        currency: 'VND',
        attempts: [
          { amount: '100.00', status: 'SUCCEEDED', reconStatus: 'PENDING_VERIFY' },
        ],
      },
    ]);
    expect(pending.fullyCovered).toBe(false);
    expect(pending.hasUnverifiedSucceeded).toBe(true);
  });

  it('keeps partial cover and open attempts from marking an order refunded', () => {
    const partial = evaluateOrderRefundCover({
      payments: [payment],
      requests: [
        {
          paymentId: 'pay-1',
          amount: '40.00',
          status: 'SUCCEEDED',
          currency: 'VND',
          attempts: [{ amount: '40.00', status: 'SUCCEEDED', reconStatus: 'VERIFIED' }],
        },
      ],
    });
    expect(partial.canMarkRefunded).toBe(false);

    const open = evaluateOrderRefundCover({
      payments: [payment],
      requests: [
        {
          paymentId: 'pay-1',
          amount: '100.00',
          status: 'PROCESSING',
          currency: 'VND',
          attempts: [{ amount: '100.00', status: 'UNCONFIRMED', reconStatus: 'PENDING_VERIFY' }],
        },
      ],
    });
    expect(open.canMarkRefunded).toBe(false);
    expect(open.reasons.some((reason) => reason.startsWith('open_attempt'))).toBe(true);
  });

  it('does not mix payments or allow over-refund', () => {
    const multi = evaluateOrderRefundCover({
      payments: [
        payment,
        { id: 'pay-2', amount: '50.00', status: 'SUCCESS' },
      ],
      requests: [
        {
          paymentId: 'pay-1',
          amount: '100.00',
          status: 'SUCCEEDED',
          currency: 'VND',
          attempts: [{ amount: '100.00', status: 'SUCCEEDED', reconStatus: 'VERIFIED' }],
        },
      ],
    });
    expect(multi.canMarkRefunded).toBe(false);

    const over = evaluatePaymentRefundCover(payment, [
      {
        paymentId: 'pay-1',
        amount: '80.00',
        status: 'SUCCEEDED',
        currency: 'VND',
        attempts: [{ amount: '80.00', status: 'SUCCEEDED', reconStatus: 'VERIFIED' }],
      },
      {
        paymentId: 'pay-1',
        amount: '40.00',
        status: 'SUCCEEDED',
        currency: 'VND',
        attempts: [{ amount: '40.00', status: 'SUCCEEDED', reconStatus: 'VERIFIED' }],
      },
    ]);
    expect(over.overRefund).toBe(true);
    expect(over.fullyCovered).toBe(false);
  });
});
