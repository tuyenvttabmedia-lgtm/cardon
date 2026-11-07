import { describe, expect, it } from 'vitest';
import {
  buildEsimOrderTimeline,
  formatEsimMoney,
  gatewayLabel,
  pickCurrencyBucket,
  sumMoneyBucketsByCurrency,
} from './esim-ops-ui';
import type { EsimOpsDetail } from '@/types/api';

function baseDetail(overrides: Partial<EsimOpsDetail> = {}): EsimOpsDetail {
  return {
    id: 'order-1',
    orderCode: 'ORD-1',
    paymentStatus: 'WAITING_PAYMENT',
    fulfillmentStatus: 'PENDING',
    createdAt: '2026-11-07T01:00:00.000Z',
    customer: { name: null, email: 'a@b.c', phone: null },
    pricing: {
      customerPaid: '100000',
      sellAmount: '100000',
      providerCost: '0',
      paymentFeeAmount: '0',
      paymentMethod: null,
      paymentGateway: null,
    },
    payments: [],
    lastError: null,
    present: true,
    providerName: 'Airalo',
    providerCode: 'AIRALO',
    providerMode: null,
    providerProductCode: 'pkg',
    packageTitle: 'AE 1GB',
    airaloOrderId: null,
    profilePresent: false,
    installSecretMasked: null,
    installSecret: null,
    attempts: [],
    ...overrides,
  };
}

describe('esim-ops-ui helpers', () => {
  it('sums commerce buckets per currency without mixing VND and USD', () => {
    const summed = sumMoneyBucketsByCurrency([
      { currency: 'VND', amount: '100000', payments: 1 },
      { currency: 'vnd', amount: '50000', payments: 2 },
      { currency: 'USD', amount: '4.5', payments: 1 },
      { currency: 'USD', amount: '1.5', payments: 1 },
    ]);
    expect(summed).toEqual([
      { currency: 'USD', amount: '6', payments: 2 },
      { currency: 'VND', amount: '150000', payments: 3 },
    ]);
    expect(pickCurrencyBucket(summed, 'VND')?.amount).toBe('150000');
    expect(pickCurrencyBucket(summed, 'EUR')).toBeNull();
  });

  it('formats money without inventing currency conversion', () => {
    expect(formatEsimMoney('4.12', 'USD')).toContain('4.12');
    expect(formatEsimMoney('100000', 'VND')).toMatch(/100/);
    expect(gatewayLabel('SEPAY')).toContain('Viet QR');
  });

  it('builds timeline only from evidence on the detail payload', () => {
    const unpaid = buildEsimOrderTimeline(baseDetail());
    expect(unpaid[0].state).toBe('done');
    expect(unpaid[0].at).toBe('2026-11-07T01:00:00.000Z');
    expect(unpaid[1].state).toBe('current');
    expect(unpaid[2].state).toBe('todo');
    expect(unpaid[3].state).toBe('todo');

    const paid = buildEsimOrderTimeline(
      baseDetail({
        paymentStatus: 'PAID',
        payments: [
          {
            paymentReference: 'PAY-1',
            gateway: 'SEPAY',
            amount: '100000',
            currency: 'VND',
            status: 'SUCCESS',
            paidAt: '2026-11-07T02:00:00.000Z',
            createdAt: '2026-11-07T01:30:00.000Z',
          },
        ],
        airaloOrderId: '104',
        profilePresent: true,
        fulfillmentStatus: 'COMPLETED',
        attempts: [
          {
            id: 'a1',
            operation: 'CREATE',
            outcome: 'CONFIRMED_CREATED',
            providerReference: '104',
            providerStatus: null,
            errorMessage: null,
            createdAt: '2026-11-07T02:10:00.000Z',
            completedAt: '2026-11-07T02:11:00.000Z',
          },
          {
            id: 'a2',
            operation: 'QUERY',
            outcome: 'PROFILE_SAVED',
            providerReference: '104',
            providerStatus: null,
            errorMessage: null,
            createdAt: '2026-11-07T02:12:00.000Z',
            completedAt: '2026-11-07T02:13:00.000Z',
          },
        ],
      }),
    );
    expect(paid.every((step) => step.state === 'done')).toBe(true);
    expect(paid[2].at).toBe('2026-11-07T02:00:00.000Z');
  });

  it('marks payment failure without inventing a paid timestamp', () => {
    const expired = buildEsimOrderTimeline(
      baseDetail({
        paymentStatus: 'EXPIRED',
        payments: [
          {
            paymentReference: 'PAY-X',
            gateway: 'PAYPAL',
            amount: '4.12',
            currency: 'USD',
            status: 'EXPIRED',
            paidAt: null,
            createdAt: '2026-11-07T01:30:00.000Z',
          },
        ],
      }),
    );
    expect(expired[1].state).toBe('done');
    expect(expired[2].state).toBe('failed');
    expect(expired[2].at).toBeNull();
    expect(expired[3].state).toBe('todo');
  });
});
