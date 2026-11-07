import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FulfillmentStatus } from '@prisma/client';
import { CardEncryptionService } from '../provider/services/card-encryption.service';
import {
  AiraloHttpTransport,
  AiraloRequestError,
  EsimAiraloAdapter,
} from './esim-airalo.adapter';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimProviderPort } from './esim-provider.port';
import type { EsimQuoteRow } from './esim-fulfillment.repository';

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret-not-real';
const ACCESS_TOKEN = 'test-access-token-not-real';
const FIXTURE_LPA = 'LPA:1$smdp.test.invalid$MATCH-LPA02';
const TEST_ENCRYPTION_KEY = '01234567890123456789012345678901';

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
      const hit = handlers[key] ?? handlers[`${request.method} ${url.pathname}`];
      if (!hit) {
        return { status: 404, body: JSON.stringify({ meta: { message: `missing ${key}` } }) };
      }
      return hit;
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

function quote(mode: 'MOCK' | 'LIVE' = 'LIVE'): EsimQuoteRow {
  return {
    quoteId: 'quote-1',
    orderItemId: 'item-1',
    providerId: 'provider-airalo',
    providerProductCode: 'japan-1gb-7days',
    providerMode: mode,
  };
}

class MemoryFulfillmentStore {
  profiles = new Set<string>();
  open = new Set<string>();
  creates: string[] = [];
  references = new Map<string, { attemptId: string; providerReference: string | null; providerStatus?: string }>();
  createOutcomes = new Map<string, 'SENT' | 'UNCONFIRMED'>();
  savedSecrets: string[] = [];
  status: FulfillmentStatus = FulfillmentStatus.PENDING;
  unconfirmedMessages: string[] = [];
  queryOpenGuard: string | null = null;
  queryClaims = 0;

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
  async saveCreateReference(input: {
    attemptId: string;
    orderItemId: string;
    providerReference: string;
    providerStatus?: string;
  }) {
    const current = this.references.get(input.orderItemId);
    if (!current || current.attemptId !== input.attemptId) {
      throw new Error('reference written to the wrong attempt');
    }
    current.providerReference = input.providerReference;
    current.providerStatus = input.providerStatus;
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
  async markUnconfirmed(attemptId: string, orderItemId: string, errorMessage?: string) {
    this.createOutcomes.set(attemptId, 'UNCONFIRMED');
    this.open.add(orderItemId);
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
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

function fulfillment(store: MemoryFulfillmentStore, port: ReturnType<typeof livePort>, encryption?: CardEncryptionService) {
  return new EsimFulfillmentService(
    store as never,
    new EsimMockAdapter(),
    port as never,
    (encryption ?? {
      encrypt: (value: string) => `enc:${value}`,
      decrypt: (value: string) => value.slice(4),
    }) as never,
    undefined,
    undefined,
    new EsimGetLease(new MemoryEsimLeaseRedis()),
  );
}

function collectedLogs(spies: jest.SpyInstance[]): string {
  return spies.flatMap((spy) => spy.mock.calls.flat()).map(String).join('\n');
}

describe('GATE LPA-02 Airalo adapter', () => {
  it('throws AiraloRequestError on HTTP 422 and strips secrets from the message', async () => {
    const dirty =
      'the parameter is invalid LPA:1$smdp.leaked.invalid$QR token=Bearer leaked-token client_secret=leaked-secret';
    const transport = urlTransport({
      'POST /v2/token': tokenOk(),
      'GET /v2/packages': {
        status: 422,
        body: JSON.stringify({
          meta: { code: 422, message: dirty },
          data: { qrcode: FIXTURE_LPA, access_token: ACCESS_TOKEN },
        }),
      },
    });
    const adapter = armedAdapter(transport);
    const error = await adapter.listBundles().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiraloRequestError);
    expect((error as AiraloRequestError).status).toBe(422);
    const message = (error as Error).message;
    expect(message).toContain('422');
    expect(message).toContain('code 422');
    expect(message).not.toContain(FIXTURE_LPA);
    expect(message).not.toContain('LPA:1$');
    expect(message).not.toContain(ACCESS_TOKEN);
    expect(message).not.toContain(CLIENT_SECRET);
    expect(message).not.toContain('leaked-token');
    expect(message).not.toContain('leaked-secret');
    expect(message).not.toContain('smdp.leaked.invalid');
  });

  it('GET recover: include=sims 422 then bare GET 200 is parsed', async () => {
    const transport = urlTransport({
      'POST /v2/token': tokenOk(),
      'GET /v2/orders/104159?include=sims': {
        status: 422,
        body: JSON.stringify({ meta: { code: 422, message: 'the parameter is invalid' } }),
      },
      'GET /v2/orders/104159': {
        status: 200,
        body: JSON.stringify({
          data: {
            id: 104159,
            code: '20261024-104159',
            status: { slug: 'completed' },
            sims: [{ qrcode: FIXTURE_LPA, lpa: 'smdp.test.invalid', matching_id: 'MATCH-LPA02' }],
          },
        }),
      },
    });
    const adapter = armedAdapter(transport);
    await expect(adapter.getInstallDetails('104159')).resolves.toEqual({
      orderReference: '20261024-104159',
      providerOrderId: '104159',
      providerOrderCode: '20261024-104159',
      status: 'completed',
      currency: undefined,
      total: undefined,
      installSecret: FIXTURE_LPA,
    });
  });

  it('GET recover: every variant 422 throws sanitized AiraloRequestError', async () => {
    const transport = urlTransport({
      'POST /v2/token': tokenOk(),
      'GET /v2/orders/104159?include=sims': {
        status: 422,
        body: JSON.stringify({ meta: { code: 422, message: `invalid ${FIXTURE_LPA}` } }),
      },
      'GET /v2/orders/104159': {
        status: 422,
        body: JSON.stringify({ meta: { code: 422, message: 'the parameter is invalid' } }),
      },
      'GET /v2/orders?filter[code]=104159&include=sims': {
        status: 422,
        body: JSON.stringify({ meta: { code: 422, message: 'the parameter is invalid' } }),
      },
    });
    const adapter = armedAdapter(transport);
    const error = await adapter.getOrder('104159').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AiraloRequestError);
    expect((error as AiraloRequestError).status).toBe(422);
    expect((error as Error).message).not.toContain(FIXTURE_LPA);
  });
});

describe('GATE LPA-02 fulfill recover', () => {
  it('keeps NEED_MANUAL_REVIEW and does not CREATE again when every GET fails', async () => {
    const store = new MemoryFulfillmentStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
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
    expect(port.getInstallDetails).toHaveBeenCalledTimes(2);
    expect(port.getInstallDetails).toHaveBeenCalledWith('104159');
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
  });

  it('CREATE with reference and no LPA uses getInstallDetails then persists a valid LPA', async () => {
    const store = new MemoryFulfillmentStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: 'ord-1', status: 'completed' }),
      getInstallDetails: async () => ({
        orderReference: 'ord-1',
        status: 'completed',
        installSecret: FIXTURE_LPA,
      }),
    });
    const service = fulfillment(store, port);
    const result = await service.fulfill('order-1');
    expect(result).toEqual({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
      created: true,
    });
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(port.getInstallDetails).toHaveBeenCalledWith('ord-1');
    expect(store.savedSecrets).toEqual([`enc:${FIXTURE_LPA}`]);
    expect(store.profiles.size).toBe(1);
    expect(store.open.has('item-1')).toBe(false);
  });

  it('CREATE timeout or 422 without a reference stays unconfirmed and does not CREATE again', async () => {
    const cases: Array<() => Promise<never>> = [
      async () => {
        throw new Error('timeout');
      },
      async () => {
        throw new AiraloRequestError('Airalo request failed with status 422 (code 422)', 422);
      },
    ];
    for (const createOrder of cases) {
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
      expect(store.references.get('item-1')?.providerReference).toBeNull();
    }
  });
});

describe('GATE LPA-02 AES-256-GCM', () => {
  const encryption = new CardEncryptionService({
    get: (key: string) => (key === 'encryption.key' ? TEST_ENCRYPTION_KEY : undefined),
  } as ConfigService);

  it('round-trips a fixture LPA and never stores plaintext', async () => {
    const cipher = encryption.encrypt(FIXTURE_LPA);
    expect(cipher).not.toContain(FIXTURE_LPA);
    expect(cipher).not.toContain('MATCH-LPA02');
    expect(cipher.split(':')).toHaveLength(3);
    expect(encryption.decrypt(cipher)).toBe(FIXTURE_LPA);
    expect(encryption.encrypt(FIXTURE_LPA)).not.toBe(cipher);

    const store = new MemoryFulfillmentStore();
    const port = livePort({
      createOrder: async () => ({
        orderReference: 'ord-aes',
        status: 'completed',
        installSecret: FIXTURE_LPA,
      }),
    });
    const service = fulfillment(store, port, encryption);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(store.savedSecrets).toHaveLength(1);
    expect(store.savedSecrets[0]).not.toContain(FIXTURE_LPA);
    expect(store.savedSecrets[0]).not.toMatch(/^enc:/);
    expect(encryption.decrypt(store.savedSecrets[0])).toBe(FIXTURE_LPA);
  });
});

describe('GATE LPA-02 log safety', () => {
  it('CREATE logs hasLpa only — no LPA, QR, token, or client secret', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const transport = urlTransport({
      'POST /v2/token': tokenOk(),
      'POST /v2/orders': {
        status: 200,
        body: JSON.stringify({
          data: {
            id: 991,
            code: 'ORD-991',
            sims: [{ qrcode: FIXTURE_LPA }],
          },
        }),
      },
    });
    try {
      const adapter = armedAdapter(transport);
      await adapter.createOrder({ items: [{ bundleName: 'japan-1gb-7days', quantity: 1 }] });
      const text = collectedLogs([log, error, warn, debug]);
      expect(text).toContain('hasLpa=true');
      expect(text).not.toContain(FIXTURE_LPA);
      expect(text).not.toContain('MATCH-LPA02');
      expect(text).not.toContain(ACCESS_TOKEN);
      expect(text).not.toContain(CLIENT_SECRET);
      expect(text).not.toContain(CLIENT_ID);
    } finally {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
      debug.mockRestore();
    }
  });
});
