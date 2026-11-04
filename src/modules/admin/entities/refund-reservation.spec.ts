import { Decimal } from '@prisma/client/runtime/library';
import { remainingOnRequest, remainingRefundable } from './refund-reservation';

describe('refund reservation math', () => {
  it('holds the full REQUESTED amount with no attempts', () => {
    const usage = remainingRefundable('100.00', [
      { amount: '100.00', status: 'REQUESTED', attempts: [] },
    ]);
    expect(usage.succeeded.toFixed(2)).toBe('0.00');
    expect(usage.reserved.toFixed(2)).toBe('100.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });

  it('does not double-count a PROCESSING request with a SENT attempt', () => {
    const usage = remainingRefundable('100.00', [
      {
        amount: '100.00',
        status: 'PROCESSING',
        attempts: [{ amount: '100.00', status: 'SENT' }],
      },
    ]);
    expect(usage.reserved.toFixed(2)).toBe('100.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });

  it('does not release reservation for UNCONFIRMED attempts', () => {
    const usage = remainingRefundable('181000.00', [
      {
        amount: '181000.00',
        status: 'PROCESSING',
        attempts: [{ amount: '181000.00', status: 'UNCONFIRMED' }],
      },
    ]);
    expect(usage.succeeded.toFixed(2)).toBe('0.00');
    expect(usage.reserved.toFixed(2)).toBe('181000.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });

  it('keeps remaining hold after a partial SUCCEEDED attempt', () => {
    const usage = remainingRefundable('100.00', [
      {
        amount: '100.00',
        status: 'PROCESSING',
        attempts: [{ amount: '40.00', status: 'SUCCEEDED' }],
      },
    ]);
    expect(usage.succeeded.toFixed(2)).toBe('40.00');
    expect(usage.reserved.toFixed(2)).toBe('60.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });

  it('keeps remaining hold on MANUAL_REVIEW after a rejected recon', () => {
    const usage = remainingRefundable('100.00', [
      {
        amount: '100.00',
        status: 'MANUAL_REVIEW',
        attempts: [{ amount: '40.00', status: 'SUCCEEDED' }],
      },
    ]);
    expect(usage.succeeded.toFixed(2)).toBe('40.00');
    expect(usage.reserved.toFixed(2)).toBe('60.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });

  it('returns remaining request amount after SUCCEEDED attempts', () => {
    expect(
      remainingOnRequest({
        amount: '100.00',
        status: 'PROCESSING',
        attempts: [{ amount: '40.00', status: 'SUCCEEDED' }],
      }).toFixed(2),
    ).toBe('60.00');
  });

  it('counts UNCONFIRMED on a CANCELLED request so timeout cannot free the cap', () => {
    const usage = remainingRefundable(new Decimal('100.00'), [
      {
        amount: '100.00',
        status: 'CANCELLED',
        attempts: [{ amount: '100.00', status: 'UNCONFIRMED' }],
      },
    ]);
    expect(usage.reserved.toFixed(2)).toBe('100.00');
    expect(usage.remaining.toFixed(2)).toBe('0.00');
  });
});
