import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addMoney,
  buildEsimOpsDashboard,
  esimOpsCurrency,
  esimOpsLane,
  esimOpsRange,
  pickUniqueSuccessPayments,
  sanitizeEsimOpsAuditMetadata,
} from './esim-ops-dashboard';

function order(partial: Partial<Parameters<typeof buildEsimOpsDashboard>[0]['ordersCreated'][number]> & { id: string }) {
  return {
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    providerMode: 'LIVE',
    providerProductCode: 'pkg-vn',
    clientTrace: {},
    providerCost: '80000',
    paymentFeeAmount: '0',
    ...partial,
  };
}

describe('ESIM-OPS-01 dashboard aggregates', () => {
  it('defaults to the last 7 Vietnam calendar days and accepts custom bounds', () => {
    const range = esimOpsRange({ preset: '7d' }, new Date('2026-10-27T12:00:00+07:00'));
    expect(range.preset).toBe('7d');
    expect(range.from.toISOString()).toBe(new Date('2026-10-21T00:00:00+07:00').toISOString());
    expect(range.to.toISOString()).toBe(new Date('2026-10-28T00:00:00+07:00').toISOString());
    const custom = esimOpsRange({ from: '2026-10-01', to: '2026-10-01' });
    expect(custom.preset).toBe('custom');
    expect(() => esimOpsRange({ from: '2026-10-02', to: '2026-10-01' })).toThrow(/from must/);
  });

  it('does not count PENDING payments or a second SUCCESS on the same order', () => {
    const unique = pickUniqueSuccessPayments([
      {
        orderId: 'o1',
        amount: '100000',
        gateway: 'SEPAY',
        paidAt: new Date('2026-10-27T01:00:00.000Z'),
        createdAt: new Date('2026-10-27T00:00:00.000Z'),
      },
      {
        orderId: 'o1',
        amount: '100000',
        gateway: 'SEPAY',
        paidAt: new Date('2026-10-27T02:00:00.000Z'),
        createdAt: new Date('2026-10-27T00:30:00.000Z'),
      },
    ]);
    expect(unique).toHaveLength(1);
    expect(unique[0].paidAt?.toISOString()).toBe('2026-10-27T02:00:00.000Z');
    const built = buildEsimOpsDashboard({
      range: esimOpsRange({ from: '2026-10-27', to: '2026-10-27' }),
      ordersCreated: [
        order({ id: 'o1' }),
        order({ id: 'o2', paymentStatus: 'WAITING_PAYMENT', fulfillmentStatus: 'PENDING' }),
      ],
      successPayments: [
        {
          orderId: 'o1',
          amount: '120000.00',
          gateway: 'SEPAY',
          paidAt: new Date('2026-10-27T03:00:00.000Z'),
          createdAt: new Date('2026-10-27T03:00:00.000Z'),
        },
      ],
      packages: new Map([['pkg-vn', { countryIso: 'VN', title: 'Vietnam 1GB' }]]),
    });
    expect(built.orders.unpaid).toBe(1);
    expect(built.revenue.commerce).toEqual([
      { currency: 'VND', gateway: 'SEPAY', amount: '120000.00', payments: 1 },
    ]);
    expect(built.matchedSuccessPayments).toBe(1);
  });

  it('does not mix VND and USD and keeps sandbox revenue out of commerce', () => {
    expect(esimOpsCurrency('PAYPAL')).toBe('USD');
    expect(esimOpsCurrency('SEPAY')).toBe('VND');
    expect(esimOpsLane({ providerMode: 'MOCK' })).toBe('sandbox');
    expect(esimOpsLane({ providerMode: 'LIVE', clientTrace: { adminTest: true } })).toBe('sandbox');
    const built = buildEsimOpsDashboard({
      range: esimOpsRange({ from: '2026-10-01', to: '2026-10-31' }),
      ordersCreated: [
        order({ id: 'live' }),
        order({ id: 'mock', providerMode: 'MOCK' }),
        order({ id: 'paypal', providerProductCode: 'pkg-jp' }),
      ],
      successPayments: [
        {
          orderId: 'live',
          amount: '150000',
          gateway: 'SEPAY',
          paidAt: new Date('2026-10-10T00:00:00.000Z'),
          createdAt: new Date('2026-10-10T00:00:00.000Z'),
        },
        {
          orderId: 'mock',
          amount: '99000',
          gateway: 'SEPAY',
          paidAt: new Date('2026-10-11T00:00:00.000Z'),
          createdAt: new Date('2026-10-11T00:00:00.000Z'),
        },
        {
          orderId: 'paypal',
          amount: '12.50',
          gateway: 'PAYPAL',
          paidAt: new Date('2026-10-12T00:00:00.000Z'),
          createdAt: new Date('2026-10-12T00:00:00.000Z'),
        },
      ],
      packages: new Map([
        ['pkg-vn', { countryIso: 'VN', title: 'Vietnam 1GB' }],
        ['pkg-jp', { countryIso: 'JP', title: 'Japan 3GB' }],
      ]),
    });
    expect(built.revenue.commerce).toHaveLength(2);
    expect(built.revenue.commerce.map((row) => row.currency).sort()).toEqual(['USD', 'VND']);
    expect(built.revenue.commerce.find((row) => row.currency === 'VND')?.amount).toBe('150000.00');
    expect(built.revenue.commerce.find((row) => row.currency === 'USD')?.amount).toBe('12.50');
    expect(built.revenue.sandbox[0]).toEqual({
      currency: 'VND',
      gateway: 'SEPAY',
      amount: '99000.00',
      payments: 1,
    });
    expect(addMoney('150000.00', '99000.00')).toBe('249000.00');
    expect(built.checkoutCostSnapshot.available).toBe(false);
    expect(built.countries.map((row) => row.countryIso).sort()).toEqual(['JP', 'VN']);
  });

  it('defines install success only on commercial PAID orders and strips secrets from audit metadata', () => {
    const built = buildEsimOpsDashboard({
      range: esimOpsRange({ from: '2026-10-27', to: '2026-10-27' }),
      ordersCreated: [
        order({ id: 'ok' }),
        order({ id: 'paid-wait', fulfillmentStatus: 'PROCESSING' }),
        order({ id: 'unpaid', paymentStatus: 'WAITING_PAYMENT', fulfillmentStatus: 'PENDING' }),
        order({ id: 'mock', providerMode: 'MOCK' }),
      ],
      successPayments: [],
      packages: new Map(),
    });
    expect(built.installSuccessRate).toEqual({
      numerator: 1,
      denominator: 2,
      rate: 0.5,
    });
    expect(built.orders.paidUnfulfilled).toBe(1);
    expect(sanitizeEsimOpsAuditMetadata({
      orderCode: 'ESIM-1',
      installSecret: 'LPA:1$smdp$MATCH',
      qrSvg: '<svg/>',
      result: 'revealed',
    })).toEqual({ orderCode: 'ESIM-1', result: 'revealed' });
    expect(JSON.stringify(built)).not.toMatch(/LPA:1\$|installSecret|qrSvg/i);
  });

  it('admin ops dashboard API counts SUCCESS once and never invents profit', () => {
    const service = readFileSync(join(__dirname, 'esim-admin.service.ts'), 'utf8');
    const helper = readFileSync(join(__dirname, 'esim-ops-dashboard.ts'), 'utf8');
    const controller = readFileSync(join(__dirname, '../admin/controllers/esim-ops.controller.ts'), 'utf8');
    expect(controller).toContain("@Get('dashboard')");
    expect(controller).toContain("@Permissions('orders.read')");
    expect(service).toContain('PaymentRecordStatus.SUCCESS');
    expect(service).toContain('buildEsimOpsDashboard');
    expect(service).toContain('sanitizeEsimOpsAuditMetadata');
    expect(helper).toContain('pickUniqueSuccessPayments');
    expect(helper).toContain('available: false');
    expect(helper).toContain('PAYPAL=USD');
    expect(helper).not.toMatch(/grossProfit:\s*addMoney/);
  });
});
