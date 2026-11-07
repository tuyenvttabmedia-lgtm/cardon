import { buildEsimFinanceRevenue, exportEsimFinanceRevenueCsv } from './esim-finance-revenue';
import { esimOpsRange } from './esim-ops-dashboard';

function order(partial: {
  id: string;
  paymentStatus?: string;
  providerMode?: string | null;
  clientTrace?: unknown;
  paymentFeeAmount?: string;
}) {
  return {
    id: partial.id,
    paymentStatus: partial.paymentStatus ?? 'PAID',
    fulfillmentStatus: 'COMPLETED',
    providerMode: partial.providerMode ?? 'LIVE',
    providerProductCode: 'pkg',
    clientTrace: partial.clientTrace ?? {},
    providerCost: '1.00',
    paymentFeeAmount: partial.paymentFeeAmount ?? '0.30',
    chargeCurrency: 'USD',
    chargeAmount: '10',
    costCurrency: 'USD',
    costAmount: '1',
  };
}

describe('buildEsimFinanceRevenue', () => {
  const range = esimOpsRange({ preset: '7d' }, new Date('2026-11-07T12:00:00+07:00'));

  it('keeps VND and USD separate and dedupes SUCCESS payments per order', () => {
    const report = buildEsimFinanceRevenue({
      range,
      orders: [
        order({ id: 'o1', paymentFeeAmount: '1000' }),
        order({ id: 'o2', paymentFeeAmount: '0.40' }),
      ],
      successPayments: [
        {
          orderId: 'o1',
          amount: '100000',
          currency: 'VND',
          gateway: 'SEPAY',
          paidAt: new Date('2026-11-06T10:00:00+07:00'),
          createdAt: new Date('2026-11-06T09:00:00+07:00'),
        },
        {
          orderId: 'o1',
          amount: '99999',
          currency: 'VND',
          gateway: 'SEPAY',
          paidAt: new Date('2026-11-05T10:00:00+07:00'),
          createdAt: new Date('2026-11-05T09:00:00+07:00'),
        },
        {
          orderId: 'o2',
          amount: '4.50',
          currency: 'USD',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-11-06T11:00:00+07:00'),
          createdAt: new Date('2026-11-06T10:00:00+07:00'),
        },
      ],
    });

    expect(report.commerce.paymentCount).toBe(2);
    expect(report.commerce.byCurrency).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: 'VND', amount: '100000.00', payments: 1 }),
        expect.objectContaining({ currency: 'USD', amount: '4.50', payments: 1 }),
      ]),
    );
    const sumAll = report.commerce.byCurrency.reduce((n, row) => n + Number(row.amount), 0);
    expect(sumAll).not.toBe(Number(report.commerce.byCurrency[0]?.amount));
    expect(report.gatewayActualFees.status).toBe('UNAVAILABLE');
    expect(report.definitions.estimatedFee.toLowerCase()).toContain('ước tính');
  });

  it('excludes sandbox/admin-test from commerce totals', () => {
    const report = buildEsimFinanceRevenue({
      range,
      orders: [
        order({ id: 'live', clientTrace: {} }),
        order({ id: 'test', clientTrace: { adminTest: true }, paymentFeeAmount: '9' }),
      ],
      successPayments: [
        {
          orderId: 'live',
          amount: '5.00',
          currency: 'USD',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-11-06T10:00:00+07:00'),
          createdAt: new Date('2026-11-06T09:00:00+07:00'),
        },
        {
          orderId: 'test',
          amount: '80.00',
          currency: 'USD',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-11-06T10:00:00+07:00'),
          createdAt: new Date('2026-11-06T09:00:00+07:00'),
        },
      ],
    });

    expect(report.commerce.byCurrency).toEqual([
      expect.objectContaining({ currency: 'USD', amount: '5.00', payments: 1 }),
    ]);
    expect(report.sandbox.byCurrency).toEqual([
      expect.objectContaining({ currency: 'USD', amount: '80.00', payments: 1 }),
    ]);
  });

  it('builds by-day buckets without mixing currencies', () => {
    const report = buildEsimFinanceRevenue({
      range,
      orders: [order({ id: 'o1' })],
      successPayments: [
        {
          orderId: 'o1',
          amount: '3.00',
          currency: 'USD',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-11-06T22:30:00+07:00'),
          createdAt: new Date('2026-11-06T22:00:00+07:00'),
        },
      ],
    });
    expect(report.commerce.byDay).toEqual([
      expect.objectContaining({
        date: '2026-11-06',
        currency: 'USD',
        gateway: 'PAYPAL',
        amount: '3.00',
        payments: 1,
      }),
    ]);
  });

  it('export CSV labels estimated fees and omits secrets', () => {
    const report = buildEsimFinanceRevenue({
      range,
      orders: [order({ id: 'o1', paymentFeeAmount: '0.50' })],
      successPayments: [
        {
          orderId: 'o1',
          amount: '10.00',
          currency: 'USD',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-11-06T10:00:00+07:00'),
          createdAt: new Date('2026-11-06T09:00:00+07:00'),
        },
      ],
    });
    const csv = exportEsimFinanceRevenueCsv(report);
    expect(csv).toContain('estimated_fee');
    expect(csv).toContain('estimated_not_gateway_actual');
    expect(csv).toContain('UNAVAILABLE');
    expect(csv.toLowerCase()).not.toContain('lpa:1$');
    expect(csv.toLowerCase()).not.toContain('password');
  });
});
