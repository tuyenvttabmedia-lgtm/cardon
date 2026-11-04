import { ForbiddenException } from '@nestjs/common';
import { ESIM_LIVE_HTTP_DISABLED } from './esim.constants';
import { toAiraloOrderCode } from './esim-airalo-code';
import {
  AiraloHttpTransport,
  AiraloRequestError,
  EsimAiraloAdapter,
  parseAiraloCataloguePage,
  readAiraloInstallSecret,
  readAiraloOrderStatus,
  unwrapAiraloOrder,
} from './esim-airalo.adapter';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret-not-real';

function memoryTransport(handlers: Record<string, { status: number; body: string }>): AiraloHttpTransport {
  return {
    async send(request) {
      const path = new URL(request.url).pathname;
      const key = `${request.method} ${path}`;
      const hit = handlers[key];
      if (!hit) {
        return { status: 404, body: JSON.stringify({ meta: { message: `missing ${key}` } }) };
      }
      return hit;
    },
  };
}

describe('EsimAiraloAdapter', () => {
  it('blocks HTTP when not armed', async () => {
    const adapter = new EsimAiraloAdapter(undefined, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpEnabled: false,
      transport: memoryTransport({}),
    });
    await expect(adapter.listBundles()).rejects.toBeInstanceOf(ForbiddenException);
    await expect(adapter.listBundles()).rejects.toThrow(ESIM_LIVE_HTTP_DISABLED);
  });

  it('lists package ids from nested catalogue and creates an order with LPA', async () => {
    const transport = memoryTransport({
      'POST /v2/token': {
        status: 200,
        body: JSON.stringify({
          data: { token_type: 'Bearer', expires_in: 3600, access_token: 'tok' },
          meta: { message: 'success' },
        }),
      },
      'GET /v2/packages': {
        status: 200,
        body: JSON.stringify({
          data: [
            {
              country_code: 'JP',
              operators: [
                {
                  packages: [{ id: 'japan-7days-1gb', title: 'Japan 1GB 7 Days' }],
                },
              ],
            },
          ],
        }),
      },
      'POST /v2/orders': {
        status: 200,
        body: JSON.stringify({
          data: {
            id: 991,
            code: 'ORD-991',
            currency: 'USD',
            price: 4.5,
            sims: [{ lpa: 'LPA:1$smdp.example$MATCH', iccid: '890000' }],
          },
          meta: { message: 'success' },
        }),
      },
    });

    const adapter = new EsimAiraloAdapter(undefined, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpEnabled: true,
      transport,
    });

    await expect(adapter.listBundles()).resolves.toEqual([
      { name: 'japan-7days-1gb', description: 'Japan 1GB 7 Days' },
    ]);

    await expect(
      adapter.createOrder({ items: [{ bundleName: 'japan-7days-1gb', quantity: 1 }] }),
    ).resolves.toEqual({
      orderReference: 'ORD-991',
      providerOrderId: '991',
      providerOrderCode: 'ORD-991',
      status: 'completed',
      currency: 'USD',
      total: 4.5,
      installSecret: 'LPA:1$smdp.example$MATCH',
    });
  });

  it('builds LPA from qrcode or lpa+matching_id, not the SM-DP host alone', () => {
    expect(
      readAiraloInstallSecret({
        lpa: 'lpa.airalo.com',
        matching_id: 'TEST',
        qrcode: 'LPA:1$lpa.airalo.com$TEST',
      }),
    ).toBe('LPA:1$lpa.airalo.com$TEST');
    expect(
      readAiraloInstallSecret({
        lpa: 'rsp.truphone.com',
        matching_id: 'ABCD1234',
      }),
    ).toBe('LPA:1$rsp.truphone.com$ABCD1234');
    expect(readAiraloInstallSecret({ lpa: 'lpa.airalo.com' })).toBeUndefined();
    expect(readAiraloInstallSecret({ lpa: 'LPA:1$smdp.example$MATCH' })).toBe(
      'LPA:1$smdp.example$MATCH',
    );
  });

  it('unwraps GET order list rows and status.slug', () => {
    expect(
      unwrapAiraloOrder({
        data: [{ id: 104159, code: '20261024-104159', sims: [{ qrcode: 'LPA:1$lpa.airalo.com$TEST' }] }],
      }),
    ).toMatchObject({ code: '20261024-104159' });
    expect(readAiraloOrderStatus({ slug: 'completed', name: 'Completed' })).toBe('completed');
  });

  it('maps numeric Airalo id to Partner code YYYYMMDD-id', () => {
    expect(toAiraloOrderCode('104159', new Date('2026-10-24T15:46:00.000Z'))).toBe(
      '20261024-104159',
    );
    expect(toAiraloOrderCode('20261024-104159')).toBe('20261024-104159');
    expect(toAiraloOrderCode('104159')).toBe('104159');
  });

  it('reads GET /v2/orders with the sandbox sim shape', async () => {
    const transport = memoryTransport({
      'POST /v2/token': {
        status: 200,
        body: JSON.stringify({ data: { access_token: 'tok', expires_in: 3600 } }),
      },
      'GET /v2/orders/104159': {
        status: 200,
        body: JSON.stringify({
          data: {
            id: 104159,
            status: 'completed',
            sims: [
              {
                lpa: 'lpa.airalo.com',
                matching_id: 'TEST',
                qrcode: 'LPA:1$lpa.airalo.com$TEST',
              },
            ],
          },
        }),
      },
    });
    const adapter = new EsimAiraloAdapter(undefined, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpEnabled: true,
      transport,
    });
    await expect(adapter.getInstallDetails('104159')).resolves.toEqual({
      orderReference: '104159',
      providerOrderId: '104159',
      providerOrderCode: undefined,
      status: 'completed',
      currency: undefined,
      total: undefined,
      installSecret: 'LPA:1$lpa.airalo.com$TEST',
    });
  });

  it('does not leak credentials in error messages', async () => {
    const transport = memoryTransport({
      'POST /v2/token': { status: 401, body: JSON.stringify({ meta: { message: 'fail' } }) },
    });
    const adapter = new EsimAiraloAdapter(undefined, {
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      httpEnabled: true,
      transport,
    });
    await expect(adapter.listBundles()).rejects.toBeInstanceOf(AiraloRequestError);
    const message = await adapter.listBundles().catch((error: Error) => error.message);
    expect(message).not.toContain(CLIENT_SECRET);
    expect(message).toContain('401');
  });

  it('parses Airalo v2 nested packages including VND net_price', () => {
    const packages = parseAiraloCataloguePage({
      data: [
        {
          country_code: 'JP',
          image: { url: 'https://cdn-revamp.airalo.com/images/japan.png', width: 132, height: 100 },
          operators: [
            {
              title: 'Moshi Moshi',
              plan_type: 'data',
              is_roaming: true,
              rechargeability: true,
              activation_policy: 'first-usage',
              apn_type: 'automatic',
              info: ['Data only', 'Hotspot allowed'],
              image: { url: 'https://cdn-revamp.airalo.com/images/operator.png' },
              coverages: [{ name: 'Japan', networks: [{ name: 'NTT Docomo', types: ['4G', '5G'] }] }],
              packages: [
                {
                  id: 'japan-1gb-7days',
                  type: 'sim',
                  title: '1 GB - 7 Days',
                  amount: 1024,
                  day: 7,
                  data: '1 GB',
                  is_unlimited: false,
                  short_info: 'High-speed data for 7 days',
                  prices: {
                    net_price: { USD: 3.5, VND: 95400 },
                    recommended_retail_price: { USD: 6.5, VND: 169000 },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(packages).toEqual([
      expect.objectContaining({
        providerPackageId: 'japan-1gb-7days',
        destinationKey: 'jp',
        operatorTitle: 'Moshi Moshi',
        validityDays: 7,
        dataAmountMb: 1024,
        netPriceVnd: 95400,
        netPriceUsd: 3.5,
        retailPriceVnd: 169000,
        retailPriceUsd: 6.5,
        shortInfo: 'High-speed data for 7 days',
        activationPolicy: 'first-usage',
        apnType: 'automatic',
        isRoaming: true,
        networks: ['NTT Docomo'],
        networkTypes: ['4G', '5G'],
        countryImageUrl: 'https://cdn-revamp.airalo.com/images/japan.png',
      }),
    ]);
  });
});
