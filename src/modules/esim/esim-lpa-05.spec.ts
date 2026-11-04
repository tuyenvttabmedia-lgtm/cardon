import { FulfillmentStatus } from '@prisma/client';
import {
  AiraloHttpRequest,
  AiraloHttpTransport,
  AiraloRequestError,
  EsimAiraloAdapter,
  parseAiraloCataloguePage,
  parseAiraloErrorBody,
  readAiraloInstallSecret,
} from './esim-airalo.adapter';
import { isEsimTestSecret } from './esim-delivery.view';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimProviderPort } from './esim-provider.port';
import type { EsimQuoteRow } from './esim-fulfillment.repository';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret-not-real';
const ACCESS_TOKEN = 'test-access-token-not-real';
const FIXTURE_LPA = 'LPA:1$smdp.test.invalid$MATCH-LPA05';
const SANDBOX_LPA = 'LPA:1$lpa.airalo.com$TEST';

function tokenOk(token = ACCESS_TOKEN, expiresIn: number | string | undefined = 3600) {
  return {
    status: 200,
    body: JSON.stringify({
      data: {
        token_type: 'Bearer',
        ...(expiresIn === undefined ? {} : { expires_in: expiresIn }),
        access_token: token,
      },
      meta: { message: 'success' },
    }),
  };
}

function packagePage() {
  return {
    status: 200,
    body: JSON.stringify({
      data: [
        {
          country_code: 'JP',
          operators: [{ packages: [{ id: 'japan-1gb-7days', title: 'Japan 1GB 7 Days' }] }],
        },
      ],
      meta: { last_page: 1 },
    }),
  };
}

function createOk() {
  return {
    status: 200,
    body: JSON.stringify({
      data: {
        id: 104159,
        code: '20261024-104159',
        quantity: 1,
        price: 4.5,
        validity: '7',
        voice: null,
        text: null,
        recycled: false,
        unknown_future_field: { nested: true },
        sims: [
          {
            iccid: '8900000000000000000',
            lpa: 'smdp.test.invalid',
            matching_id: 'MATCH-LPA05',
            qrcode: FIXTURE_LPA,
            qrcode_url: 'https://example.test/qr',
            direct_apple_installation_url: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${FIXTURE_LPA}`,
            extra_sim_field: 'ignore-me',
          },
        ],
      },
    }),
  };
}

function armedAdapter(transport: AiraloHttpTransport) {
  return new EsimAiraloAdapter(undefined, {
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    httpEnabled: true,
    transport,
  });
}

function quote(): EsimQuoteRow {
  return {
    quoteId: 'quote-1',
    orderItemId: 'item-1',
    providerId: 'provider-airalo',
    providerProductCode: 'japan-1gb-7days',
    providerMode: 'LIVE',
  };
}

class MemoryFulfillmentStore {
  profiles = new Set<string>();
  open = new Set<string>();
  creates: string[] = [];
  references = new Map<string, { attemptId: string; providerReference: string | null }>();
  createOutcomes = new Map<string, 'SENT' | 'UNCONFIRMED'>();
  unconfirmedMessages: string[] = [];
  status: FulfillmentStatus = FulfillmentStatus.PENDING;

  async findQuoteByOrderId(): Promise<EsimQuoteRow> {
    return quote();
  }
  async getOrderFulfillmentStatus() {
    return this.status;
  }
  async claimFirstCreate() {
    if (this.status !== FulfillmentStatus.PENDING) return false;
    this.status = FulfillmentStatus.PROCESSING;
    return true;
  }
  async hasProfile(orderItemId: string) {
    return this.profiles.has(orderItemId);
  }
  async findOpenCreate(orderItemId: string) {
    if (!this.open.has(orderItemId)) return null;
    const row = this.references.get(orderItemId);
    if (!row) return null;
    return {
      attemptId: row.attemptId,
      outcome: this.createOutcomes.get(row.attemptId) ?? 'SENT',
      providerReference: row.providerReference,
      createdAt: new Date('2026-10-24T15:46:00.000Z'),
    };
  }
  async insertOpenCreate(row: EsimQuoteRow) {
    if (this.open.has(row.orderItemId)) return 'conflict' as const;
    this.open.add(row.orderItemId);
    const attemptId = `attempt-${this.creates.length + 1}`;
    this.creates.push(attemptId);
    this.references.set(row.orderItemId, { attemptId, providerReference: null });
    this.createOutcomes.set(attemptId, 'SENT');
    return { attemptId, requestId: `req-${attemptId}` };
  }
  async saveCreateReference() {}
  async saveProfile() {}
  async markUnconfirmed(_attemptId: string, orderItemId: string, errorMessage?: string) {
    this.open.add(orderItemId);
    if (errorMessage) this.unconfirmedMessages.push(errorMessage);
  }
  async markNeedsReview() {
    return FulfillmentStatus.NEED_MANUAL_REVIEW;
  }
  async notifyDelivered() {}
  async recordOrderEvent() {}
  async findOpenCreateReference(orderItemId: string) {
    return this.references.get(orderItemId) ?? null;
  }
  async insertQuery() {
    return 'conflict' as const;
  }
  async closeQueryAttempt() {}
}

function livePort(createOrder: EsimProviderPort['createOrder']) {
  const fail = async () => {
    throw new Error('catalogue must not be read');
  };
  return {
    listBundles: jest.fn(fail),
    getBundle: jest.fn(fail),
    listPrices: jest.fn(fail),
    validateOrder: jest.fn(fail),
    createOrder: jest.fn(createOrder),
    getOrder: jest.fn(async () => ({})),
  };
}

function fulfillment(store: MemoryFulfillmentStore, port: ReturnType<typeof livePort>) {
  return new EsimFulfillmentService(
    store as never,
    new EsimMockAdapter(),
    port as never,
    { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value.slice(4) } as never,
    undefined,
    undefined,
    new EsimGetLease(new MemoryEsimLeaseRedis()),
  );
}

describe('GATE LPA-05 CREATE transport', () => {
  it('sends FormData so the runtime sets multipart boundary, not urlencoded', async () => {
    const seen: AiraloHttpRequest[] = [];
    const transport: AiraloHttpTransport = {
      async send(request) {
        seen.push(request);
        if (request.url.includes('/v2/token')) return tokenOk();
        if (request.url.includes('/v2/orders')) return createOk();
        return { status: 404, body: '{}' };
      },
    };
    const adapter = armedAdapter(transport);
    await adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 99 }] });
    const create = seen.find((row) => row.method === 'POST' && row.url.endsWith('/v2/orders'));
    expect(create).toBeDefined();
    expect(create?.headers['Content-Type']).toBeUndefined();
    expect(create?.headers.Accept).toBe('application/json');
    expect(create?.headers['Accept-Language']).toBe('vi');
    expect(create?.body).toBeInstanceOf(FormData);
    const form = create?.body as FormData;
    expect(form.get('package_id')).toBe('japan-1gb-7days');
    expect(form.get('quantity')).toBe('50');
    expect(form.get('type')).toBe('sim');
  });

  it('clamps quantity to the documented 1–50 range', async () => {
    const quantities: string[] = [];
    const transport: AiraloHttpTransport = {
      async send(request) {
        if (request.url.includes('/v2/token')) return tokenOk();
        if (request.url.includes('/v2/orders') && request.body instanceof FormData) {
          quantities.push(String(request.body.get('quantity') ?? ''));
        }
        return createOk();
      },
    };
    const adapter = armedAdapter(transport);
    await adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 0 }] });
    await adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 1 }] });
    expect(quantities).toEqual(['1', '1']);
  });

  it('parses CREATE extras and missing optional sim fields without treating them as LPA', async () => {
    expect(
      readAiraloInstallSecret({
        iccid: '890000',
        lpa: 'lpa.airalo.com',
        matching_id: 'TEST',
        qrcode: SANDBOX_LPA,
        unknown: true,
      }),
    ).toBe(SANDBOX_LPA);
    const adapter = armedAdapter({
      async send(request) {
        if (request.url.includes('/v2/token')) return tokenOk();
        return createOk();
      },
    });
    await expect(adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 1 }] })).resolves.toEqual(
      expect.objectContaining({
        providerOrderId: '104159',
        providerOrderCode: '20261024-104159',
        total: 4.5,
        installSecret: FIXTURE_LPA,
      }),
    );
  });
});

describe('GATE LPA-05 token lifecycle', () => {
  it('reuses a cached token and coalesces concurrent fetches', async () => {
    let tokenCalls = 0;
    const transport: AiraloHttpTransport = {
      async send(request) {
        if (request.url.includes('/v2/token')) {
          tokenCalls += 1;
          expect(request.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
          expect(request.body).toBe(
            `client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`,
          );
          return tokenOk();
        }
        return packagePage();
      },
    };
    const adapter = armedAdapter(transport);
    await Promise.all([adapter.listBundles(), adapter.listBundles()]);
    await adapter.listBundles();
    expect(tokenCalls).toBe(1);
  });

  it('defaults missing or non-positive expires_in to 24 hours so the next call reuses the token', async () => {
    for (const expiresIn of [undefined, 0, 'not-a-ttl']) {
      let tokenCalls = 0;
      const transport: AiraloHttpTransport = {
        async send(request) {
          if (request.url.includes('/v2/token')) {
            tokenCalls += 1;
            return tokenOk(ACCESS_TOKEN, expiresIn as never);
          }
          return packagePage();
        },
      };
      const adapter = armedAdapter(transport);
      await adapter.listBundles();
      await adapter.listBundles();
      expect(tokenCalls).toBe(1);
    }
  });

  it('refreshes the token and retries GET once on 401, but never retries POST /v2/orders', async () => {
    let tokenCalls = 0;
    let packageCalls = 0;
    let orderCalls = 0;
    const packages: AiraloHttpTransport = {
      async send(request) {
        if (request.url.includes('/v2/token')) {
          tokenCalls += 1;
          return tokenOk(`tok-${tokenCalls}`);
        }
        packageCalls += 1;
        if (packageCalls === 1) {
          return { status: 401, body: JSON.stringify({ meta: { message: 'Client authentication failed' } }) };
        }
        expect(request.headers.Authorization).toBe('Bearer tok-2');
        return packagePage();
      },
    };
    await expect(armedAdapter(packages).listBundles()).resolves.toEqual([
      { name: 'japan-1gb-7days', description: 'Japan 1GB 7 Days' },
    ]);
    expect(tokenCalls).toBe(2);
    expect(packageCalls).toBe(2);

    const orders: AiraloHttpTransport = {
      async send(request) {
        if (request.url.includes('/v2/token')) return tokenOk();
        orderCalls += 1;
        return { status: 401, body: JSON.stringify({ meta: { message: 'Client authentication failed' } }) };
      },
    };
    await expect(
      armedAdapter(orders).createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 1 }] }),
    ).rejects.toBeInstanceOf(AiraloRequestError);
    expect(orderCalls).toBe(1);
  });

  it('prefers a real expires_in and refreshes 60s early without using the 24h fallback', async () => {
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      let shortTtlCalls = 0;
      const shortTtl = armedAdapter({
        async send(request) {
          if (request.url.includes('/v2/token')) {
            shortTtlCalls += 1;
            return tokenOk(`short-${shortTtlCalls}`, 120);
          }
          return packagePage();
        },
      });
      await shortTtl.listBundles();
      now += 61_000;
      await shortTtl.listBundles();
      expect(shortTtlCalls).toBe(2);

      let longTtlCalls = 0;
      const longTtl = armedAdapter({
        async send(request) {
          if (request.url.includes('/v2/token')) {
            longTtlCalls += 1;
            return tokenOk(`long-${longTtlCalls}`, 3600);
          }
          return packagePage();
        },
      });
      now += 1;
      await longTtl.listBundles();
      now += 61_000;
      await longTtl.listBundles();
      expect(longTtlCalls).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('does not reuse an expired token after a failed refresh and does not send GET with it', async () => {
    let now = 1_700_000_000_000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    const seen: string[] = [];
    try {
      const adapter = armedAdapter({
        async send(request) {
          seen.push(`${request.method} ${new URL(request.url).pathname} auth=${request.headers.Authorization ?? 'none'}`);
          if (request.url.includes('/v2/token')) {
            if (seen.filter((row) => row.includes('/v2/token')).length === 1) {
              return tokenOk('tok-old', 90);
            }
            return {
              status: 401,
              body: JSON.stringify({
                meta: { message: `Client authentication failed Bearer leaked-token client_secret=${CLIENT_SECRET}` },
                data: { access_token: 'tok-old', qrcode: FIXTURE_LPA },
              }),
            };
          }
          return packagePage();
        },
      });
      await adapter.listBundles();
      now += 61_000;
      const error = await adapter.listBundles().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AiraloRequestError);
      const message = (error as Error).message;
      expect(message).toContain('401');
      expect(message).not.toContain(CLIENT_SECRET);
      expect(message).not.toContain('leaked-token');
      expect(message).not.toContain(FIXTURE_LPA);
      expect(message).not.toContain('tok-old');
      expect(seen.filter((row) => row.includes('GET /v2/packages')).length).toBe(1);
      expect(seen.some((row) => row.includes('GET /v2/packages') && row.includes('tok-old'))).toBe(true);
      expect(seen.filter((row) => row.includes('GET /v2/packages') && row.includes('tok-old')).length).toBe(1);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('stops after a second GET 401 and does not retry GET when token refresh fails', async () => {
    let tokenCalls = 0;
    let packageCalls = 0;
    const persistent = armedAdapter({
      async send(request) {
        if (request.url.includes('/v2/token')) {
          tokenCalls += 1;
          return tokenOk(`tok-${tokenCalls}`);
        }
        packageCalls += 1;
        return {
          status: 401,
          body: JSON.stringify({
            meta: { message: `still unauthorized ${FIXTURE_LPA} Bearer leaked-token` },
          }),
        };
      },
    });
    const persistentError = await persistent.listBundles().catch((caught: unknown) => caught);
    expect(persistentError).toBeInstanceOf(AiraloRequestError);
    expect((persistentError as AiraloRequestError).status).toBe(401);
    expect((persistentError as Error).message).not.toContain(FIXTURE_LPA);
    expect((persistentError as Error).message).not.toContain('leaked-token');
    expect(tokenCalls).toBe(2);
    expect(packageCalls).toBe(2);

    let refreshFails = 0;
    let getAfterFail = 0;
    const refreshFail = armedAdapter({
      async send(request) {
        if (request.url.includes('/v2/token')) {
          refreshFails += 1;
          if (refreshFails === 1) return tokenOk('tok-1');
          return { status: 401, body: JSON.stringify({ meta: { message: 'Client authentication failed' } }) };
        }
        getAfterFail += 1;
        return { status: 401, body: JSON.stringify({ meta: { message: 'Client authentication failed' } }) };
      },
    });
    await expect(refreshFail.listBundles()).rejects.toBeInstanceOf(AiraloRequestError);
    expect(refreshFails).toBe(2);
    expect(getAfterFail).toBe(1);
  });
});

describe('GATE LPA-05 catalogue parser and documented errors', () => {
  it('ignores unknown catalogue fields and still maps package id', () => {
    const packages = parseAiraloCataloguePage({
      data: [
        {
          country_code: 'FR',
          min_price: { net_price: { USD: 2.25 } },
          unexpected: 'ok',
          operators: [
            {
              title: 'Operator',
              voice: 100,
              text: 50,
              packages: [
                {
                  id: 'france-1gb-7days',
                  title: '1 GB - 7 Days',
                  amount: 1024,
                  day: 7,
                  extra_flag: true,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(packages).toEqual([
      expect.objectContaining({
        providerPackageId: 'france-1gb-7days',
        destinationKey: 'fr',
        dataAmountMb: 1024,
      }),
    ]);
  });

  it('parses documented v2 codes 13/33/34/53/88/89 without leaking secrets', () => {
    const cases = [
      { code: 13, reason: `maintenance ${FIXTURE_LPA}` },
      { code: 33, reason: 'Insufficient stock' },
      { code: 34, reason: 'out of stock' },
      { code: 53, reason: 'unexpected' },
      { code: 88, reason: 'ordering disabled' },
      { code: 89, reason: 'IP not permitted' },
    ];
    for (const item of cases) {
      expect(parseAiraloErrorBody(JSON.stringify(item))).toEqual({ airaloCode: item.code, field: undefined });
    }
  });

  it('maps documented HTTP and 422 codes to safe unconfirmed messages and never opens a second CREATE', async () => {
    const cases: Array<{ error: AiraloRequestError; expect: string }> = [
      {
        error: new AiraloRequestError('ignored', 422, { airaloCode: 13 }),
        expect: 'code 13',
      },
      {
        error: new AiraloRequestError('ignored', 422, { airaloCode: 33 }),
        expect: 'code 33',
      },
      {
        error: new AiraloRequestError('ignored', 422, { airaloCode: 34 }),
        expect: 'code 34',
      },
      {
        error: new AiraloRequestError('ignored', 422, { airaloCode: 53 }),
        expect: 'code 53',
      },
      {
        error: new AiraloRequestError('ignored', 403, { airaloCode: 88 }),
        expect: 'code 88',
      },
      {
        error: new AiraloRequestError('ignored', 403, { airaloCode: 89 }),
        expect: 'code 89',
      },
      {
        error: new AiraloRequestError(`dirty ${FIXTURE_LPA}`, 401),
        expect: '401',
      },
      {
        error: new AiraloRequestError('ignored', 429),
        expect: '429',
      },
      {
        error: new AiraloRequestError('ignored', 503),
        expect: '503',
      },
    ];
    for (const item of cases) {
      const store = new MemoryFulfillmentStore();
      const port = livePort(async () => {
        throw item.error;
      });
      const first = await fulfillment(store, port).fulfill('order-1');
      const second = await fulfillment(store, port).fulfill('order-1');
      expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(second.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(port.createOrder).toHaveBeenCalledTimes(1);
      expect(store.creates).toHaveLength(1);
      expect(store.unconfirmedMessages[0]).toContain(item.expect);
      expect(store.unconfirmedMessages[0]).toContain('No second CREATE');
      expect(store.unconfirmedMessages.join(' ')).not.toContain(FIXTURE_LPA);
    }
  });

  it('recognizes official sandbox LPA as non-installable test data', () => {
    expect(isEsimTestSecret(SANDBOX_LPA)).toBe(true);
    expect(isEsimTestSecret(FIXTURE_LPA)).toBe(false);
  });
});
