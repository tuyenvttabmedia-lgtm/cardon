import { FulfillmentStatus } from '@prisma/client';
import {
  AiraloHttpTransport,
  AiraloRequestError,
  EsimAiraloAdapter,
  parseAiraloErrorBody,
} from './esim-airalo.adapter';
import { airaloGetPaths, airaloNumericId, airaloOrderCode } from './esim-airalo-code';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimProviderPort } from './esim-provider.port';
import type { EsimQuoteRow } from './esim-fulfillment.repository';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret-not-real';
const ACCESS_TOKEN = 'test-access-token-not-real';
const FIXTURE_LPA = 'LPA:1$smdp.test.invalid$MATCH-LPA04';

function tokenOk() {
  return {
    status: 200,
    body: JSON.stringify({ data: { access_token: ACCESS_TOKEN, expires_in: 3600 } }),
  };
}

function urlTransport(handlers: Record<string, { status: number; body: string }>): AiraloHttpTransport {
  return {
    async send(request) {
      const url = new URL(request.url);
      const key = `${request.method} ${url.pathname}${url.search}`;
      return handlers[key] ?? handlers[`${request.method} ${url.pathname}`] ?? {
        status: 404,
        body: JSON.stringify({ meta: { message: `missing ${key}` } }),
      };
    },
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
  savedSecrets: string[] = [];
  unconfirmedMessages: string[] = [];
  status: FulfillmentStatus = FulfillmentStatus.PENDING;
  references = new Map<
    string,
    {
      attemptId: string;
      providerReference: string | null;
      providerStatus?: string;
      safeResponseMeta?: Record<string, unknown>;
    }
  >();
  createOutcomes = new Map<string, 'SENT' | 'UNCONFIRMED'>();
  queryOpenGuard: string | null = null;
  queryClaims = 0;

  async findQuoteByOrderId() {
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
      safeResponseMeta: row.safeResponseMeta ?? null,
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
  async saveCreateReference(input: {
    attemptId: string;
    orderItemId: string;
    providerReference: string;
    providerStatus?: string;
    hasInstallSecret?: boolean;
    providerOrderId?: string;
    providerOrderCode?: string;
  }) {
    const current = this.references.get(input.orderItemId);
    if (!current || current.attemptId !== input.attemptId) {
      throw new Error('reference written to the wrong attempt');
    }
    current.providerReference = input.providerReference;
    current.providerStatus = input.providerStatus;
    current.safeResponseMeta = {
      ...(input.providerOrderId ? { providerOrderId: input.providerOrderId } : {}),
      ...(input.providerOrderCode ? { providerOrderCode: input.providerOrderCode } : {}),
      hasInstallSecret: input.hasInstallSecret === true,
      source: 'airalo',
      testData: false,
    };
    if (input.hasInstallSecret === true) {
      this.createOutcomes.set(input.attemptId, 'SENT');
      return;
    }
    this.createOutcomes.set(input.attemptId, 'UNCONFIRMED');
    this.open.add(input.orderItemId);
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
  }
  async saveProfile(input: { orderItemId: string; installSecretEnc?: string }) {
    this.profiles.add(input.orderItemId);
    if (input.installSecretEnc) this.savedSecrets.push(input.installSecretEnc);
    this.open.delete(input.orderItemId);
    this.status = FulfillmentStatus.COMPLETED;
  }
  async markUnconfirmed(_attemptId: string, orderItemId: string, errorMessage?: string) {
    this.createOutcomes.set(_attemptId, 'UNCONFIRMED');
    this.open.add(orderItemId);
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    if (errorMessage) this.unconfirmedMessages.push(errorMessage);
  }
  async markDefiniteNoCreate(_attemptId: string, orderItemId: string, errorMessage?: string) {
    this.createOutcomes.set(_attemptId, 'UNCONFIRMED');
    this.open.delete(orderItemId);
    this.status = FulfillmentStatus.WAITING_ADMIN_RETRY;
    if (errorMessage) this.unconfirmedMessages.push(errorMessage);
  }
  async markNeedsReview() {
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    return this.status;
  }
  async notifyDelivered() {}
  async recordOrderEvent() {}
  async findOpenCreateReference(orderItemId: string) {
    return this.references.get(orderItemId) ?? null;
  }
  async insertQuery(input: { createAttemptId: string }) {
    if (this.queryOpenGuard === input.createAttemptId) {
      return 'conflict' as const;
    }
    this.queryOpenGuard = input.createAttemptId;
    this.queryClaims += 1;
    return { attemptId: `query-${this.queryClaims}`, requestId: `qreq-${this.queryClaims}` };
  }
  async closeQueryAttempt() {
    this.queryOpenGuard = null;
  }
}

function livePort(options: {
  createOrder: EsimProviderPort['createOrder'];
  getInstallDetails?: EsimProviderPort['getInstallDetails'];
}) {
  const fail = async () => {
    throw new Error('catalogue must not be read');
  };
  return {
    listBundles: jest.fn(fail),
    getBundle: jest.fn(fail),
    listPrices: jest.fn(fail),
    validateOrder: jest.fn(fail),
    createOrder: jest.fn(options.createOrder),
    getOrder: jest.fn(async () => ({})),
    getInstallDetails: options.getInstallDetails ? jest.fn(options.getInstallDetails) : undefined,
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

describe('GATE LPA-04 error parser', () => {
  it('reads v2 code 11 / 43 / 83 and field package_id without leaking secrets', () => {
    expect(parseAiraloErrorBody(JSON.stringify({ code: 11, reason: 'Insufficient balance' }))).toEqual({
      airaloCode: 11,
      field: undefined,
    });
    expect(parseAiraloErrorBody(JSON.stringify({ code: 43, reason: 'Validation error' }))).toEqual({
      airaloCode: 43,
      field: undefined,
    });
    expect(parseAiraloErrorBody(JSON.stringify({ code: 83, reason: 'Duplicate request' }))).toEqual({
      airaloCode: 83,
      field: undefined,
    });
    expect(
      parseAiraloErrorBody(
        JSON.stringify({
          data: { package_id: `The selected package is invalid ${FIXTURE_LPA}` },
          meta: { message: 'the parameter is invalid' },
        }),
      ),
    ).toEqual({ airaloCode: undefined, field: 'package_id' });
  });

  it('throws sanitized AiraloRequestError for each documented 422 shape', async () => {
    const cases = [
      {
        path: 'GET /v2/packages',
        body: { code: 11, reason: `Insufficient balance ${FIXTURE_LPA}` },
        airaloCode: 11,
      },
      {
        path: 'GET /v2/packages',
        body: { code: 43, reason: 'Validation error' },
        airaloCode: 43,
      },
      {
        path: 'GET /v2/packages',
        body: { code: 83, reason: 'Duplicate request' },
        airaloCode: 83,
      },
      {
        path: 'GET /v2/packages',
        body: {
          data: { package_id: 'The selected package is invalid.' },
          meta: { message: 'the parameter is invalid' },
        },
        field: 'package_id',
      },
    ];
    for (const item of cases) {
      const adapter = armedAdapter(
        urlTransport({
          'POST /v2/token': tokenOk(),
          [item.path]: { status: 422, body: JSON.stringify(item.body) },
        }),
      );
      const error = await adapter.listBundles().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AiraloRequestError);
      const requestError = error as AiraloRequestError;
      expect(requestError.status).toBe(422);
      if (item.airaloCode) expect(requestError.airaloCode).toBe(item.airaloCode);
      if (item.field) expect(requestError.field).toBe(item.field);
      expect(requestError.message).toContain('422');
      expect(requestError.message).not.toContain(FIXTURE_LPA);
      expect(requestError.message).not.toContain(ACCESS_TOKEN);
      expect(requestError.message).not.toContain(CLIENT_SECRET);
    }
  });
});

describe('GATE LPA-04 identifiers and GET paths', () => {
  it('keeps numeric id on the detail path and dated code on filter[code] only', () => {
    expect(airaloNumericId('104159')).toBe('104159');
    expect(airaloNumericId('20261024-104159')).toBe('104159');
    expect(airaloOrderCode('104159')).toBeUndefined();
    expect(airaloOrderCode('20261024-104159')).toBe('20261024-104159');
    expect(airaloGetPaths('104159')).toEqual([
      '/v2/orders/104159?include=sims',
      '/v2/orders/104159',
    ]);
    expect(airaloGetPaths('20261024-104159')).toEqual([
      '/v2/orders?filter[code]=20261024-104159&include=sims',
    ]);
  });

  it('parses CREATE with both id and code and recovers by numeric id', async () => {
    const seen: string[] = [];
    const transport = urlTransport({
      'POST /v2/token': tokenOk(),
      'POST /v2/orders': {
        status: 200,
        body: JSON.stringify({
          data: {
            id: 104159,
            code: '20261024-104159',
            status: 'completed',
            sims: [{ qrcode: FIXTURE_LPA }],
          },
        }),
      },
    });
    const adapter = armedAdapter(transport);
    await expect(adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 1 }] })).resolves.toEqual(
      expect.objectContaining({
        orderReference: '20261024-104159',
        providerOrderId: '104159',
        providerOrderCode: '20261024-104159',
        installSecret: FIXTURE_LPA,
      }),
    );

    const listTransport: AiraloHttpTransport = {
      async send(request) {
        seen.push(`${request.method} ${new URL(request.url).pathname}${new URL(request.url).search}`);
        if (request.url.includes('/v2/token')) return tokenOk();
        if (request.url.includes('/v2/orders/104159')) {
          return {
            status: 200,
            body: JSON.stringify({
              data: { id: 104159, code: '20261024-104159', sims: [{ qrcode: FIXTURE_LPA }] },
            }),
          };
        }
        return { status: 422, body: JSON.stringify({ meta: { message: 'the parameter is invalid' } }) };
      },
    };
    const recover = armedAdapter(listTransport);
    await recover.getInstallDetails('104159');
    expect(seen.some((row) => row.includes('/v2/orders/104159?include=sims'))).toBe(true);
    expect(seen.some((row) => row.includes('filter[code]=20261024-104159'))).toBe(false);
    expect(seen.some((row) => row.includes('/v2/orders/20261024-104159'))).toBe(false);
  });
});

describe('GATE LPA-04 fulfill recover', () => {
  it('stores numeric id and code in safe meta and recovers with the numeric id', async () => {
    const store = new MemoryFulfillmentStore();
    const port = livePort({
      createOrder: async () => ({
        orderReference: '20261024-104159',
        providerOrderId: '104159',
        providerOrderCode: '20261024-104159',
        status: 'completed',
      }),
      getInstallDetails: async (reference) => {
        if (reference !== '104159') {
          throw new AiraloRequestError('Airalo request failed with status 422 (code 422)', 422);
        }
        return { orderReference: reference, installSecret: FIXTURE_LPA };
      },
    });
    const service = fulfillment(store, port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(port.getInstallDetails).toHaveBeenCalledWith('104159');
    expect(store.references.get('item-1')?.safeResponseMeta).toEqual({
      providerOrderId: '104159',
      providerOrderCode: '20261024-104159',
      hasInstallSecret: false,
      source: 'airalo',
      testData: false,
    });
    expect(store.savedSecrets).toEqual([`enc:${FIXTURE_LPA}`]);
  });

  it('does not CREATE again after timeout, plain 422, or code 83 (openGuard held)', async () => {
    const failures = [
      async () => {
        throw new Error('timeout');
      },
      async () => {
        throw new AiraloRequestError('Airalo request failed with status 422 (code 422)', 422);
      },
      async () => {
        throw new AiraloRequestError('Airalo request failed with status 422 (code 83)', 422, { airaloCode: 83 });
      },
    ];
    for (const createOrder of failures) {
      const store = new MemoryFulfillmentStore();
      const port = livePort({ createOrder });
      const service = fulfillment(store, port);
      const first = await service.fulfill('order-1');
      const second = await service.fulfill('order-1');
      expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(second.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(port.createOrder).toHaveBeenCalledTimes(1);
      expect(store.creates).toHaveLength(1);
      expect(store.profiles.size).toBe(0);
      expect(store.open.has('item-1')).toBe(true);
    }
  });

  it('maps code 11 / 43 to WAITING_ADMIN_RETRY (definite no-CREATE) and 83 to unconfirmed', async () => {
    const store = new MemoryFulfillmentStore();
    const port = livePort({
      createOrder: async () => {
        throw new AiraloRequestError('dirty LPA:1$leak$X', 422, { airaloCode: 11 });
      },
    });
    const service = fulfillment(store, port);
    const first = await service.fulfill('order-1');
    expect(first.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
    expect(store.open.has('item-1')).toBe(false);
    expect(store.unconfirmedMessages[0]).toContain('code 11');
    expect(store.unconfirmedMessages.join(' ')).not.toContain('LPA:1$');

    const validation = new MemoryFulfillmentStore();
    await fulfillment(
      validation,
      livePort({
        createOrder: async () => {
          throw new AiraloRequestError('ignored', 422, { airaloCode: 43, field: 'package_id' });
        },
      }),
    ).fulfill('order-1');
    expect(validation.status).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
    expect(validation.unconfirmedMessages[0]).toContain('code 43');
    expect(validation.unconfirmedMessages[0]).toContain('field=package_id');

    const duplicate = new MemoryFulfillmentStore();
    await fulfillment(
      duplicate,
      livePort({
        createOrder: async () => {
          throw new AiraloRequestError('ignored', 422, { airaloCode: 83 });
        },
      }),
    ).fulfill('order-1');
    expect(duplicate.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(duplicate.unconfirmedMessages[0]).toContain('code 83');
    expect(duplicate.unconfirmedMessages[0]).toContain('Recover only');
  });

  it('GET 422 after a stored reference stays in review and does not CREATE again', async () => {
    const store = new MemoryFulfillmentStore();
    store.open.add('item-1');
    store.references.set('item-1', {
      attemptId: 'attempt-1',
      providerReference: '20261024-104159',
      safeResponseMeta: { providerOrderId: '104159', providerOrderCode: '20261024-104159' },
    });
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    const port = livePort({
      createOrder: async () => ({ orderReference: 'should-not-create' }),
      getInstallDetails: async () => {
        throw new AiraloRequestError('Airalo request failed with status 422 (code 422)', 422);
      },
    });
    const service = fulfillment(store, port);
    const first = await service.fulfill('order-1');
    const second = await service.fulfill('order-1');
    expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(second.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails?.mock.calls.flat()).toEqual(['104159', '20261024-104159', '104159', '20261024-104159']);
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
  });
});
