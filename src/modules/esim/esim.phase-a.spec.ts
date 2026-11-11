import { createHook } from 'async_hooks';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as net from 'net';
import { BadRequestException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FulfillmentStatus, OrderPaymentStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ADMIN_ESIM_QUERY_CLAIM_CLOSE, EsimAdminService } from './esim-admin.service';
import {
  ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF,
  ESIM_QUERY_CLAIM_LEASE_PRESENT,
  ESIM_QUERY_CLAIM_LEASE_UNKNOWN,
} from './esim-get-lease';
import {
  ESIM_QUERY_CLAIM_BUSY,
  ESIM_QUERY_CLAIM_UNVERIFIED,
} from './esim-query-activity.probe';
import { EsimAccountService } from './esim-account.service';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimGoAdapter } from './esim-go.adapter';
import { EsimLiveAdapter } from './esim-live.adapter';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimOrderService } from './esim-order.service';
import { EsimQueueProducer } from './esim-queue.producer';
import { EsimWorker } from './esim.worker';
import { evaluateEsimSale } from './esim-policy';
import { EsimProviderPort } from './esim-provider.port';
import { ESIM_LIVE_HTTP_DISABLED, ESIM_QUEUE_JOB, ESIM_TEST_MARKER } from './esim.constants';
import { renderEmailTemplate } from '../notification/templates/template.registry';
import { sanitizeNotificationLogContext } from '../notification/entities/notification-log-safety';
import { FulfillmentDispatchService } from '../provider/services/fulfillment-dispatch.service';
import { AdminOrderService } from '../admin/services/admin-order.service';
import { PaidOrderWatchdogService } from '../operations-center/services/paid-order-watchdog.service';
import { OrderService } from '../order/services/order.service';
import { EsimFulfillmentRepository, type EsimQuoteRow } from './esim-fulfillment.repository';

const root = join(__dirname, '../../..');

function quote(mode: 'MOCK' | 'LIVE' = 'MOCK'): EsimQuoteRow {
  return {
    quoteId: 'quote-1',
    orderItemId: 'item-1',
    providerId: 'provider-locked',
    providerProductCode: 'MOCK-ESIM-TEST',
    providerMode: mode,
  };
}

class MemoryFulfillmentStore {
  profiles = new Set<string>();
  open = new Set<string>();
  creates: string[] = [];
  references = new Map<string, { attemptId: string; providerReference: string | null; providerStatus?: string }>();
  queries: Array<{ attemptId: string; requestId: string; operation: 'QUERY'; providerReference: string; openGuard: string | null }> = [];
  createGuards = new Map<string, string>();
  createOutcomes = new Map<string, 'SENT' | 'UNCONFIRMED'>();
  unconfirmedAttempts: string[] = [];
  failQueryInsert = false;
  failQueryResult = false;
  queryResults: Array<{ attemptId: string; outcome: 'UNCONFIRMED'; providerStatus?: string }> = [];
  status: FulfillmentStatus = FulfillmentStatus.PENDING;
  savedSecrets: string[] = [];
  failSave = false;
  failMail = false;
  failReview = false;
  reviewWrites = 0;

  async findQuoteByOrderId(): Promise<EsimQuoteRow> {
    return quote();
  }

  async getOrderFulfillmentStatus() {
    return this.status;
  }

  async claimFirstCreate() {
    if (this.status !== FulfillmentStatus.PENDING) {
      return false;
    }
    this.status = FulfillmentStatus.PROCESSING;
    return true;
  }

  async hasProfile(orderItemId: string) {
    return this.profiles.has(orderItemId);
  }

  async hasOpenAttempt(orderItemId: string) {
    return this.open.has(orderItemId);
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
    const requestId = `req-${this.creates.length + 1}`;
    this.creates.push(requestId);
    this.references.set(row.orderItemId, { attemptId, providerReference: null });
    this.createGuards.set(attemptId, row.orderItemId);
    this.createOutcomes.set(attemptId, 'SENT');
    return { attemptId, requestId };
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

  async findOpenCreateReference(orderItemId: string) {
    return this.references.get(orderItemId) ?? null;
  }

  async insertQuery(input: { quote: EsimQuoteRow; providerReference: string; createAttemptId: string }) {
    if (this.failQueryInsert) throw new Error('query insert failed');
    if (input.createAttemptId === input.quote.orderItemId) {
      throw new Error('QUERY openGuard must be the CREATE attempt id');
    }
    if (this.queries.some((row) => row.openGuard === input.createAttemptId)) {
      return 'conflict' as const;
    }
    const attemptId = `query-${this.queries.length + 1}`;
    const requestId = `esim-query-${input.quote.orderItemId}-${attemptId}`;
    this.queries.push({
      attemptId,
      requestId,
      operation: 'QUERY',
      providerReference: input.providerReference,
      openGuard: input.createAttemptId,
    });
    return { attemptId, requestId };
  }

  async closeQueryAttempt(input: { attemptId: string; providerStatus?: string; failed: boolean }) {
    if (this.failQueryResult) throw new Error('query result write failed');
    const row = this.queries.find((item) => item.attemptId === input.attemptId);
    if (!row) throw new Error('QUERY claim could not be closed');
    row.openGuard = null;
    this.queryResults.push({
      attemptId: input.attemptId,
      outcome: 'UNCONFIRMED',
      providerStatus: input.providerStatus,
    });
    if (this.status !== FulfillmentStatus.COMPLETED) {
      this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    }
  }

  async saveProfile(input: { orderItemId: string; installSecretEnc?: string }) {
    if (this.failSave) throw new Error('profile write failed');
    this.profiles.add(input.orderItemId);
    if (input.installSecretEnc) this.savedSecrets.push(input.installSecretEnc);
    this.open.delete(input.orderItemId);
    this.status = FulfillmentStatus.COMPLETED;
  }

  async markUnconfirmed(attemptId: string, orderItemId: string) {
    this.unconfirmedAttempts.push(attemptId);
    this.createOutcomes.set(attemptId, 'UNCONFIRMED');
    this.open.add(orderItemId);
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
  }

  async markNeedsReview(): Promise<FulfillmentStatus> {
    if (this.failReview) throw new Error('review status write failed');
    this.reviewWrites += 1;
    if (this.status === FulfillmentStatus.COMPLETED) return this.status;
    if (
      this.status === FulfillmentStatus.PENDING ||
      this.status === FulfillmentStatus.PROCESSING ||
      this.status === FulfillmentStatus.NEED_MANUAL_REVIEW
    ) {
      this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
      return this.status;
    }
    throw new Error('review status write failed');
  }

  async recordOrderEvent() {}

  async notifyDelivered() {
    if (this.failMail) throw new Error('smtp down');
  }
}

function closedPort(): EsimProviderPort & { createOrder: jest.Mock; getOrder: jest.Mock; listBundles: jest.Mock; listPrices: jest.Mock } {
  const fail = async () => {
    throw new ForbiddenException(ESIM_LIVE_HTTP_DISABLED);
  };
  return {
    listBundles: jest.fn(fail),
    getBundle: jest.fn(fail),
    listPrices: jest.fn(fail),
    validateOrder: jest.fn(fail),
    createOrder: jest.fn(fail),
    getOrder: jest.fn(fail),
  };
}

function fulfillment(
  store: MemoryFulfillmentStore,
  mock = new EsimMockAdapter(),
  port: EsimProviderPort = closedPort(),
) {
  return {
    service: new EsimFulfillmentService(
      store as never,
      mock,
      port,
      { encrypt: (value: string) => `enc:${value}`, decrypt: (value: string) => value.slice(4) } as never,
      undefined,
      undefined,
      new EsimGetLease(new MemoryEsimLeaseRedis()),
    ),
    mock,
    port,
  };
}

function trackSockets(): { sockets: string[]; stop: () => void } {
  const sockets: string[] = [];
  const hook = createHook({
    init(_asyncId, type) {
      if (type === 'TCPWRAP' || type === 'TLSWRAP') sockets.push(type);
    },
  });
  hook.enable();
  return { sockets, stop: () => hook.disable() };
}

describe('Phase A eSIM policy', () => {
  it('keeps sales closed unless both flags are on and mode is mock', () => {
    expect(
      evaluateEsimSale({
        envEnabled: false,
        settingsEnabled: true,
        providerMode: 'mock',
        liveArm: false,
      }).ok,
    ).toBe(false);
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: false,
        providerMode: 'mock',
        liveArm: false,
      }).ok,
    ).toBe(false);
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'live',
        liveArm: false,
      }),
    ).toEqual({ ok: false, reason: 'LIVE_HTTP_DISABLED' });
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'live',
        liveArm: true,
      }),
    ).toEqual({ ok: true, mode: 'live' });
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'mock',
        liveArm: true,
      }),
    ).toEqual({ ok: true, mode: 'mock' });
    expect(
      evaluateEsimSale({
        envEnabled: true,
        settingsEnabled: true,
        providerMode: 'mock',
        liveArm: false,
      }),
    ).toEqual({ ok: true, mode: 'mock' });
  });

  it('refuses live HTTP even when the arm flag is set', () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({} as Response);
    const adapter = new EsimLiveAdapter();
    expect(() => adapter.create()).toThrow(ESIM_LIVE_HTTP_DISABLED);
    expect(() => adapter.query()).toThrow(ESIM_LIVE_HTTP_DISABLED);
    expect(fetchSpy).not.toHaveBeenCalled();
    const source = readFileSync(join(root, 'src/modules/esim/esim-live.adapter.ts'), 'utf8');
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/axios|got\(|http\.request/);
    fetchSpy.mockRestore();
  });
});

describe('Phase A eSIM fulfillment', () => {
  it('does not create a second time after a timeout', async () => {
    const store = new MemoryFulfillmentStore();
    const { service, mock } = fulfillment(store);
    const first = await service.fulfill('order-1', { simulateTimeout: true });
    const second = await service.fulfill('order-1', { simulateTimeout: true });
    expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(second.created).toBe(false);
    expect(mock.createCount).toBe(1);
    expect(store.creates).toHaveLength(1);
  });

  it('lets only one of two competing workers create', async () => {
    const store = new MemoryFulfillmentStore();
    const { service, mock } = fulfillment(store);
    const [left, right] = await Promise.all([
      service.fulfill('order-1'),
      service.fulfill('order-1'),
    ]);
    const created = [left, right].filter((row) => row.created);
    expect(created).toHaveLength(1);
    expect(mock.createCount).toBe(1);
    expect(store.profiles.size).toBe(1);
  });

  it('keeps the profile and COMPLETED when email fails', async () => {
    const store = new MemoryFulfillmentStore();
    store.failMail = true;
    const { service, mock } = fulfillment(store);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(store.profiles.has('item-1')).toBe(true);
    expect(store.status).toBe(FulfillmentStatus.COMPLETED);
    expect(mock.createCount).toBe(1);
  });

  it('does not create again when saving the profile fails', async () => {
    const store = new MemoryFulfillmentStore();
    store.failSave = true;
    const { service, mock } = fulfillment(store);
    await service.fulfill('order-1');
    store.failSave = false;
    await service.fulfill('order-1');
    expect(mock.createCount).toBe(1);
    expect(store.profiles.size).toBe(0);
    expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
  });

  it('fulfills a stored mock quote while sales are closed', async () => {
    const store = new MemoryFulfillmentStore();
    const { service } = fulfillment(store);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(store.profiles.size).toBe(1);
  });

  it('does not call fetch for a live quote', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const connectSpy = jest.spyOn(net.Socket.prototype, 'connect');
    const sockets = trackSockets();
    const transport = { send: jest.fn() };
    const port = new EsimGoAdapter(undefined, {
      apiKey: 'test-key-not-a-secret',
      transport,
    });
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    try {
      const result = await service.fulfill('order-1');
      const second = await service.fulfill('order-1');
      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(second.created).toBe(false);
      expect(mock.createCount).toBe(0);
      expect(store.creates).toHaveLength(1);
      expect(store.queries).toHaveLength(0);
      expect(transport.send).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(sockets.sockets).toEqual([]);
    } finally {
      sockets.stop();
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
  });
});

describe('Sprint 2 eSIM CREATE/QUERY', () => {
  function livePort(createOrder: EsimProviderPort['createOrder'], getOrder: EsimProviderPort['getOrder'] = async () => ({})) {
    const fail = async () => {
      throw new Error('catalogue must not be read');
    };
    return {
      listBundles: jest.fn(fail),
      getBundle: jest.fn(fail),
      listPrices: jest.fn(fail),
      validateOrder: jest.fn(fail),
      createOrder: jest.fn(createOrder),
      getOrder: jest.fn(getOrder),
      getInstallDetails: undefined as EsimProviderPort['getInstallDetails'],
    };
  }

  it('completes a mock quote without calling the provider port', async () => {
    const store = new MemoryFulfillmentStore();
    const port = closedPort();
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(mock.createCount).toBe(1);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(port.listBundles).not.toHaveBeenCalled();
    expect(port.listPrices).not.toHaveBeenCalled();
  });

  it('does not create again after a live timeout, network error, or invalid response', async () => {
    const failures = [
      async () => {
        throw new Error('timeout');
      },
      async () => {
        throw new Error('network down');
      },
      async () => {
        throw new Error('eSIM Go response was not valid JSON');
      },
      async () => ({ status: 'completed' }),
      async () => ({ orderReference: '   ' }),
    ];
    for (const createOrder of failures) {
      const store = new MemoryFulfillmentStore();
      const port = livePort(createOrder);
      store.findQuoteByOrderId = async () => quote('LIVE');
      const { service } = fulfillment(store, new EsimMockAdapter(), port);
      await service.fulfill('order-1');
      await service.fulfill('order-1');
      expect(port.createOrder).toHaveBeenCalledTimes(1);
      expect(port.getOrder).not.toHaveBeenCalled();
      expect(store.creates).toHaveLength(1);
      expect(store.queries).toHaveLength(0);
      expect(store.open.has('item-1')).toBe(true);
      expect(store.profiles.size).toBe(0);
    }
  });

  it('saves a live install string without calling the mock adapter', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    const port = livePort(async () => ({
      orderReference: 'ord-live',
      status: 'completed',
      installSecret: 'LPA:1$smdp.example.com$MATCH-001',
    }));
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.created).toBe(true);
    expect(port.createOrder).toHaveBeenCalledWith({
      items: [{ bundleName: 'MOCK-ESIM-TEST', quantity: 1 }],
      assign: true,
    });
    expect(mock.createCount).toBe(0);
    expect(port.listBundles).not.toHaveBeenCalled();
    expect(store.profiles.size).toBe(1);
    expect(store.savedSecrets).toEqual(['enc:LPA:1$smdp.example.com$MATCH-001']);
    expect(store.status).toBe(FulfillmentStatus.COMPLETED);
  });

  it('stores a reference on the create attempt and does not infer delivery', async () => {
    const store = new MemoryFulfillmentStore();
    const stored = { ...quote('LIVE'), providerCost: '90000' };
    store.findQuoteByOrderId = async () => stored;
    const port = livePort(async () => ({
      orderReference: ' ord-1 ',
      status: 'completed',
    }));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.created).toBe(false);
    expect(store.references.get('item-1')).toEqual({
      attemptId: 'attempt-1',
      providerReference: 'ord-1',
      providerStatus: 'completed',
    });
    expect(store.profiles.size).toBe(0);
    expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(stored.providerMode).toBe('LIVE');
    expect(stored.providerCost).toBe('90000');
  });

  it('queries only a stored reference and does not call createOrder', async () => {
    const store = new MemoryFulfillmentStore();
    const stored = { ...quote('LIVE'), providerCost: '90000' };
    store.findQuoteByOrderId = async () => stored;
    const port = livePort(
      async () => ({ orderReference: 'ord-1', status: 'completed' }),
      async () => ({ orderReference: 'ord-1', status: 'completed' }),
    );
    const { service } = fulfillment(store, new EsimMockAdapter(), port);

    await service.fulfill('order-1');
    const missing = new MemoryFulfillmentStore();
    missing.findQuoteByOrderId = async () => stored;
    const missingPort = livePort(async () => ({ status: 'completed' }));
    const missingService = fulfillment(missing, new EsimMockAdapter(), missingPort).service;
    await missingService.fulfill('order-1');
    await missingService.query('order-1');
    expect(missingPort.getOrder).not.toHaveBeenCalled();
    expect(missing.queries).toHaveLength(0);

    const queried = await service.query('order-1');
    expect(queried.created).toBe(false);
    expect(queried.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(port.getOrder).toHaveBeenCalledTimes(1);
    expect(port.getOrder).toHaveBeenCalledWith('ord-1');
    expect(store.queries).toEqual([
      expect.objectContaining({
        operation: 'QUERY',
        providerReference: 'ord-1',
        openGuard: null,
      }),
    ]);
    expect(store.queryResults).toEqual([
      expect.objectContaining({ outcome: 'UNCONFIRMED', providerStatus: 'completed' }),
    ]);
    expect(store.profiles.size).toBe(0);
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
    expect(store.open.has('item-1')).toBe(true);
    expect(stored.providerMode).toBe('LIVE');
    expect(stored.providerCost).toBe('90000');
    expect(port.listBundles).not.toHaveBeenCalled();
    expect(port.listPrices).not.toHaveBeenCalled();
  });

  it('does not query a mock quote through the provider port', async () => {
    const store = new MemoryFulfillmentStore();
    const stored = { ...quote('MOCK'), providerCost: '90000' };
    store.findQuoteByOrderId = async () => stored;
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await service.fulfill('order-1');
    await service.query('order-1');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(stored.providerMode).toBe('MOCK');
    expect(stored.providerCost).toBe('90000');
  });

  it('recovers a stored Airalo CREATE by GET install details and does not CREATE again', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    store.createGuards.set('attempt-1', 'item-1');
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    const port = livePort(async () => ({ orderReference: 'should-not-create' }));
    port.getInstallDetails = jest.fn(async () => ({
      orderReference: '104159',
      status: 'completed',
      installSecret: 'LPA:1$lpa.airalo.com$TEST',
    }));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result).toMatchObject({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
      created: false,
      queried: true,
      hasOpenCreate: false,
      hasReference: true,
    });
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalledWith('104159');
    expect(store.profiles.size).toBe(1);
    expect(store.savedSecrets).toEqual(['enc:LPA:1$lpa.airalo.com$TEST']);
    expect(store.creates).toHaveLength(0);
  });

  it('lets only one of two live workers create', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    const port = livePort(async () => ({ orderReference: 'ord-live' }));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const [left, right] = await Promise.all([
      service.fulfill('order-1'),
      service.fulfill('order-1'),
    ]);
    expect(left.created).toBe(false);
    expect(right.created).toBe(false);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
    expect(store.profiles.size).toBe(0);
  });
});

describe('Sprint 3 eSIM worker QUERY', () => {
  function fulfillJob(orderId = 'order-1') {
    return { name: ESIM_QUEUE_JOB.FULFILL, id: `esim-fulfill-${orderId}`, data: { orderId } } as never;
  }

  function rememberLiveQuote() {
    const stored = { ...quote('LIVE'), providerCost: '90000' };
    return stored;
  }

  it('fulfills a mock quote without calling the provider query', async () => {
    const store = new MemoryFulfillmentStore();
    const stored = { ...quote('MOCK'), providerCost: '90000' };
    store.findQuoteByOrderId = async () => stored;
    const port = closedPort();
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    await new EsimWorker(service).process(fulfillJob());
    expect(mock.createCount).toBe(1);
    expect(store.status).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(store.queries).toHaveLength(0);
    expect(stored.providerMode).toBe('MOCK');
    expect(stored.providerCost).toBe('90000');
  });

  it('does not read a live order that has no stored reference', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const connectSpy = jest.spyOn(net.Socket.prototype, 'connect');
    const sockets = trackSockets();
    const transport = { send: jest.fn() };
    const port = new EsimGoAdapter(undefined, { apiKey: 'test-key-not-a-secret', transport });
    const store = new MemoryFulfillmentStore();
    const stored = rememberLiveQuote();
    store.findQuoteByOrderId = async () => stored;
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    try {
      await new EsimWorker(service).process(fulfillJob());
      expect(mock.createCount).toBe(0);
      expect(store.creates).toHaveLength(1);
      expect(store.queries).toHaveLength(0);
      expect(store.profiles.size).toBe(0);
      expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(transport.send).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(sockets.sockets).toEqual([]);
      expect(stored.providerMode).toBe('LIVE');
      expect(stored.providerCost).toBe('90000');
    } finally {
      sockets.stop();
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
  });

  it('queries a stored live reference without opening a network connection', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const connectSpy = jest.spyOn(net.Socket.prototype, 'connect');
    const sockets = trackSockets();
    const transport = { send: jest.fn() };
    const port = new EsimGoAdapter(undefined, { apiKey: 'test-key-not-a-secret', transport });
    const store = new MemoryFulfillmentStore();
    const stored = rememberLiveQuote();
    store.findQuoteByOrderId = async () => stored;
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    store.createGuards.set('attempt-1', 'item-1');
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    try {
      await new EsimWorker(service).process(fulfillJob());
      expect(store.creates).toHaveLength(0);
      expect(store.queries).toEqual([
        expect.objectContaining({ operation: 'QUERY', providerReference: 'ord-1', openGuard: null }),
        expect.objectContaining({ operation: 'QUERY', providerReference: 'ord-1', openGuard: null }),
      ]);
      expect(store.profiles.size).toBe(0);
      expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
      expect(transport.send).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(connectSpy).not.toHaveBeenCalled();
      expect(sockets.sockets).toEqual([]);
      expect(stored.providerCost).toBe('90000');
    } finally {
      sockets.stop();
      fetchSpy.mockRestore();
      connectSpy.mockRestore();
    }
  });

  it('does not create another order when the provider query fails', async () => {
    const store = new MemoryFulfillmentStore();
    const stored = rememberLiveQuote();
    store.findQuoteByOrderId = async () => stored;
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    store.createGuards.set('attempt-1', 'item-1');
    const port = closedPort();
    port.getOrder.mockRejectedValue(new Error('network down'));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await new EsimWorker(service).process(fulfillJob());
    await new EsimWorker(service).process(fulfillJob());
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).toHaveBeenCalledTimes(2);
    expect(store.creates).toHaveLength(0);
    expect(store.queries).toHaveLength(2);
    expect(store.queries.every((row) => row.openGuard === null)).toBe(true);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.profiles.size).toBe(0);
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
    expect(stored.providerMode).toBe('LIVE');
    expect(stored.providerCost).toBe('90000');
  });

  it('lets two workers create once and claim one query', async () => {
    const creating = new MemoryFulfillmentStore();
    const createdQuote = rememberLiveQuote();
    creating.findQuoteByOrderId = async () => createdQuote;
    const createPort = closedPort();
    createPort.createOrder.mockResolvedValue({ orderReference: 'ord-live', status: 'completed' });
    const creatingService = fulfillment(creating, new EsimMockAdapter(), createPort).service;
    const creatingWorker = new EsimWorker(creatingService);
    await Promise.all([
      creatingWorker.process(fulfillJob()),
      creatingWorker.process(fulfillJob()),
    ]);
    expect(createPort.createOrder).toHaveBeenCalledTimes(1);
    expect(creating.creates).toHaveLength(1);
    expect(creating.profiles.size).toBe(0);
    expect(creating.status).not.toBe(FulfillmentStatus.COMPLETED);
    expect(createdQuote.providerCost).toBe('90000');

    const querying = new MemoryFulfillmentStore();
    querying.findQuoteByOrderId = async () => rememberLiveQuote();
    querying.open.add('item-1');
    querying.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    querying.createGuards.set('attempt-1', 'item-1');
    const queryPort = closedPort();
    queryPort.getOrder.mockResolvedValue({ orderReference: 'ord-1', status: 'completed' });
    const queryingWorker = new EsimWorker(fulfillment(querying, new EsimMockAdapter(), queryPort).service);
    await Promise.all([
      queryingWorker.process(fulfillJob()),
      queryingWorker.process(fulfillJob()),
    ]);
    expect(queryPort.createOrder).not.toHaveBeenCalled();
    expect(queryPort.getOrder.mock.calls.length).toBeGreaterThan(0);
    expect(queryPort.getOrder.mock.calls.length).toBeLessThanOrEqual(2);
    expect(querying.creates).toHaveLength(0);
    expect(querying.queries.every((row) => row.openGuard === null)).toBe(true);
    expect(querying.createGuards.get('attempt-1')).toBe('item-1');
    expect(querying.profiles.size).toBe(0);
    expect(querying.status).not.toBe(FulfillmentStatus.COMPLETED);
  });

  it('keeps the esim queue job id and a single attempt', () => {
    const workerSource = readFileSync(join(root, 'src/modules/esim/esim.worker.ts'), 'utf8');
    const producerSource = readFileSync(join(root, 'src/modules/esim/esim-queue.producer.ts'), 'utf8');
    const queueSource = readFileSync(join(root, 'src/queue/queue.module.ts'), 'utf8');
    expect(workerSource).toContain('this.fulfillment.query(');
    expect(workerSource).not.toContain('httpEnabled');
    expect(workerSource).not.toContain('createOrder');
    expect(workerSource).not.toContain('api.esim-go.com');
    expect(producerSource).toContain('const jobId = `esim-fulfill-${orderId}`');
    expect(producerSource).toContain('attempts: 1');
    expect(queueSource).toMatch(/const ESIM_QUEUE_JOB_OPTIONS = \{[\s\S]*?attempts: 1/);
  });
});

describe('B3.19 QUERY claim', () => {
  function seedLiveReference() {
    const store = new MemoryFulfillmentStore();
    const stored = { ...quote('LIVE'), providerCost: '90000' };
    store.findQuoteByOrderId = async () => stored;
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    store.createGuards.set('attempt-1', 'item-1');
    return { store, stored };
  }

  it('lets only one concurrent query call the provider', async () => {
    const { store } = seedLiveReference();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const port = closedPort();
    port.getOrder.mockImplementation(() => gate.then(() => ({ orderReference: 'ord-1', status: 'completed' })));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const pending = Promise.all([service.query('order-1'), service.query('order-1')]);
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    expect(port.getOrder).toHaveBeenCalledTimes(1);
    release();
    await pending;
    expect(port.getOrder).toHaveBeenCalledTimes(1);
    expect(store.queries).toHaveLength(1);
    expect(store.queries[0].openGuard).toBeNull();
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.creates).toHaveLength(0);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
  });

  it('runs a later query only after the previous claim is closed', async () => {
    const { store } = seedLiveReference();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const port = closedPort();
    port.getOrder.mockImplementation(() => gate.then(() => ({ orderReference: 'ord-1', status: 'completed' })));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const first = service.query('order-1');
    for (let step = 0; step < 20; step += 1) await Promise.resolve();
    const second = await service.query('order-1');
    expect(second.created).toBe(false);
    expect(port.getOrder).toHaveBeenCalledTimes(1);
    expect(store.queries).toHaveLength(1);
    release();
    await first;
    expect(store.queries[0].openGuard).toBeNull();
    await service.query('order-1');
    expect(port.getOrder).toHaveBeenCalledTimes(2);
    expect(store.queries).toHaveLength(2);
    expect(store.queries.every((row) => row.openGuard === null)).toBe(true);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.profiles.size).toBe(0);
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
  });

  it('does not read the provider again while a crashed query claim stays open', async () => {
    const { store } = seedLiveReference();
    store.queries.push({
      attemptId: 'query-stuck',
      requestId: 'esim-query-item-1-query-stuck',
      operation: 'QUERY',
      providerReference: 'ord-1',
      openGuard: 'attempt-1',
    });
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.query('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.queries).toHaveLength(1);
    expect(store.queries[0].openGuard).toBe('attempt-1');
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.creates).toHaveLength(0);
  });

  it('releases the query guard after a finished read so a later query can run', async () => {
    const { store, stored } = seedLiveReference();
    const port = closedPort();
    port.getOrder.mockResolvedValue({ orderReference: 'ord-1', status: 'completed' });
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await service.query('order-1');
    expect(store.queries[0].openGuard).toBeNull();
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
    expect(store.profiles.size).toBe(0);
    await service.query('order-1');
    expect(port.getOrder).toHaveBeenCalledTimes(2);
    expect(store.queries).toHaveLength(2);
    expect(store.queries.every((row) => row.openGuard === null)).toBe(true);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.creates).toHaveLength(0);
    expect(stored.providerMode).toBe('LIVE');
    expect(stored.providerCost).toBe('90000');
  });

  it('keeps the create attempt open when the provider query times out', async () => {
    const { store } = seedLiveReference();
    const port = closedPort();
    port.getOrder.mockRejectedValue(new Error('timeout'));
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await service.query('order-1');
    expect(store.open.has('item-1')).toBe(true);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.queries[0].openGuard).toBeNull();
    expect(store.unconfirmedAttempts).toEqual([]);
    expect(store.creates).toHaveLength(0);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.profiles.size).toBe(0);
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
    await service.query('order-1');
    expect(port.getOrder).toHaveBeenCalledTimes(2);
    expect(store.creates).toHaveLength(0);
  });

  it('does not call the provider when the query insert fails', async () => {
    const { store } = seedLiveReference();
    store.failQueryInsert = true;
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await expect(service.query('order-1')).rejects.toThrow('query insert failed');
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(store.queries).toHaveLength(0);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
  });

  it('does not change the create guard when the query result write fails', async () => {
    const { store } = seedLiveReference();
    store.failQueryResult = true;
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await expect(service.query('order-1')).rejects.toThrow('QUERY claim could not be closed');
    expect(port.getOrder).toHaveBeenCalledTimes(1);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.queries[0].openGuard).toBe('attempt-1');
    expect(store.unconfirmedAttempts).toEqual([]);
    expect(store.creates).toHaveLength(0);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('turns a Prisma P2002 into a query conflict and leaves the create guard untouched', async () => {
    const create = jest.fn().mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const repository = new EsimFulfillmentRepository({
      esimProviderAttempt: { create },
    } as never);
    await expect(repository.insertQuery({
      quote: quote('LIVE'),
      providerReference: 'ord-1',
      createAttemptId: 'attempt-1',
    })).resolves.toBe('conflict');
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        operation: 'QUERY',
        openGuard: 'attempt-1',
        providerReference: 'ord-1',
      }),
    });

    const update = jest.fn();
    const updateMany = jest.fn();
    const writer = new EsimFulfillmentRepository({
      esimProviderAttempt: { update },
      $transaction: async (fn: (tx: {
        esimProfile: { findUnique: () => Promise<null> };
        esimProviderAttempt: { update: jest.Mock; findUnique: () => Promise<{ outcome: string }> };
        orderItem: { findUnique: () => Promise<{ orderId: string }> };
        order: { findUnique: () => Promise<{ fulfillmentStatus: FulfillmentStatus }>; updateMany: jest.Mock };
      }) => Promise<void>) => fn({
        esimProfile: { findUnique: async () => null },
        esimProviderAttempt: {
          update,
          findUnique: async () => ({ outcome: 'SENT' }),
        },
        orderItem: { findUnique: async () => ({ orderId: 'order-1' }) },
        order: {
          findUnique: async () => ({ fulfillmentStatus: FulfillmentStatus.PROCESSING }),
          updateMany,
        },
      }),
    } as never);
    await writer.markUnconfirmed('query-1', 'item-1');
    expect(update).toHaveBeenCalledWith({
      where: { id: 'query-1' },
      data: expect.not.objectContaining({ openGuard: 'item-1' }),
    });
    expect(update.mock.calls[0][0].data.openGuard).toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        fulfillmentStatus: {
          in: [
            FulfillmentStatus.PENDING,
            FulfillmentStatus.PROCESSING,
            FulfillmentStatus.WAITING_ADMIN_RETRY,
            FulfillmentStatus.NEED_MANUAL_REVIEW,
          ],
        },
      },
      data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
    });

    const closeUpdate = jest.fn();
    const closer = new EsimFulfillmentRepository({
      esimProviderAttempt: { update: closeUpdate },
    } as never);
    await closer.closeQueryAttempt({
      attemptId: 'query-1',
      failed: false,
      providerStatus: 'completed',
    });
    expect(closeUpdate).toHaveBeenCalledWith({
      where: { id: 'query-1' },
      data: expect.objectContaining({
        openGuard: null,
        outcome: 'UNCONFIRMED',
      }),
    });
  });
});

describe('Phase A eSIM order boundaries', () => {
  it('rejects a guest before any payment call', async () => {
    const service = new EsimOrderService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { get: () => true } as never,
    );
    await expect(
      service.create({ items: [{ variantId: 'v', quantity: 1 }] } as never, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a mixed card and eSIM cart before writing an order', async () => {
    const esimCreate = jest.fn();
    const variants = new Map([
      ['esim', { id: 'esim', type: 'ESIM' }],
      ['card', { id: 'card', type: 'CARD' }],
    ]);
    const orderService = new OrderService(
      {} as never,
      {} as never,
      { findActiveById: async (id: string) => variants.get(id) ?? null } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { create: esimCreate } as never,
    );
    await expect(
      orderService.createOrder({
        items: [
          { variantId: 'esim', quantity: 1 },
          { variantId: 'card', quantity: 1 },
        ],
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(esimCreate).not.toHaveBeenCalled();
  });

  it.each([
    { mode: 'mock', arm: false, expected: 'MOCK' },
    { mode: 'live', arm: true, expected: 'LIVE' },
  ])('locks the first eligible provider for a $expected quote', async ({ mode, arm, expected }) => {
    const quoteCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          $executeRaw: async () => 1,
          esimOrderQuote: { create: quoteCreate },
          order: {
            findMany: async () => [],
            findFirst: async () => ({
              id: 'order-1',
              orderCode: 'CO1',
              channel: 'B2C',
              isGuestOrder: false,
              guestEmail: 'a@test.invalid',
              guestPhone: null,
              invoiceRequired: false,
              invoiceMetadata: {},
              customerNote: null,
              totalAmount: new Decimal(100000),
              faceValue: new Decimal(100000),
              sellAmount: new Decimal(100000),
              discountAmount: new Decimal(0),
              paymentMethodCode: 'SEPAY',
              methodDisplayName: 'SePay',
              paymentGateway: 'SEPAY',
              settlementType: 'BANK_TRANSFER',
              paymentFeePercent: new Decimal(0),
              paymentFeeFixed: new Decimal(0),
              paymentFeeAmount: new Decimal(0),
              customerPaid: new Decimal(100000),
              providerCost: new Decimal(90000),
              profit: new Decimal(10000),
              paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
              fulfillmentStatus: FulfillmentStatus.PENDING,
              paymentExpiresAt: new Date(),
              createdAt: new Date(),
              orderItems: [],
            }),
          },
        }),
    };
    const service = new EsimOrderService(
      prisma as never,
      {
        createFinancialTransaction: async () => ({ id: 'fin-1' }),
        createWithTransaction: async () => ({ id: 'order-1' }),
        createOrderItem: async () => ({ id: 'item-1' }),
      } as never,
      {
        findActiveById: async () => ({
          id: 'variant-1',
          type: 'ESIM',
          faceValue: 100000,
        }),
      } as never,
      { getCustomerPrice: async () => '100000' } as never,
      {
        listForVariant: async () => [
          {
            provider: { id: 'provider-priority' },
            mapping: { providerProductCode: 'MOCK-A', providerCost: 90000 },
          },
          {
            provider: { id: 'provider-cheaper' },
            mapping: { providerProductCode: 'MOCK-B', providerCost: 1000 },
          },
        ],
      } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: true }),
        getPublicPaymentMethods: () => [{ methodCode: 'SEPAY', esimEnabled: true }],
        resolvePaymentMethod: () => ({
          methodCode: 'SEPAY',
          displayName: 'SePay',
          gatewayCode: 'SEPAY',
          settlementType: 'BANK_TRANSFER',
          percentageFee: 0,
          fixedFee: 0,
        }),
        resolveEsimPaymentMethod: () => ({
          methodCode: 'SEPAY',
          displayName: 'SePay',
          gatewayCode: 'SEPAY',
          settlementType: 'BANK_TRANSFER',
          percentageFee: 0,
          fixedFee: 0,
        }),
        listEsimMegapayMethodCodes: () => [],
      } as never,
      {
        get: (key: string) => {
          if (key === 'esim.enabled') return true;
          if (key === 'esim.providerMode') return mode;
          if (key === 'esim.liveArm') return arm;
          return undefined;
        },
      } as never,
    );

    await service.create(
      { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
      { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' } as never,
    );

    expect(quoteCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        providerId: 'provider-priority',
        providerProductCode: 'MOCK-A',
        providerMode: expected,
      }),
    });
    const payload = quoteCreate.mock.calls[0][0].data;
    expect(payload.sellPrice).toBeUndefined();
  });
});

describe('Phase A eSIM access, admin, dispatch, and logs', () => {
  it('hides another customer profile', async () => {
    const decrypt = jest.fn();
    const service = new EsimAccountService(
      {
        order: {
          findFirst: async ({ where }: { where: { userId: string } }) =>
            where.userId === 'owner'
              ? {
                  id: 'order-1',
                  orderCode: 'CO1',
                  createdAt: new Date(),
                  paymentStatus: 'PAID',
                  fulfillmentStatus: 'COMPLETED',
                  orderItems: [
                    {
                      variant: { name: '1GB', product: { name: 'eSIM Nhật Bản' } },
                      esimProfile: { id: 'p1', createdAt: new Date(), installSecretEnc: 'enc' },
                    },
                  ],
                }
              : null,
        },
      } as never,
      { decrypt } as never,
    );
    await expect(service.getForUser('other', 'order-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('returns a live install string to the owner and hides a secret that is neither test nor LPA', async () => {
    const paidEsim = {
      id: 'order-1',
      orderCode: 'CO1',
      createdAt: new Date(),
      paymentStatus: 'PAID',
      fulfillmentStatus: 'COMPLETED',
      orderItems: [
        {
          variant: { name: '1GB', product: { name: 'eSIM Nhật Bản' } },
          esimProfile: { id: 'p1', createdAt: new Date(), installSecretEnc: 'enc' },
        },
      ],
    };
    const service = new EsimAccountService(
      { order: { findFirst: async () => paidEsim } } as never,
      { decrypt: () => 'LPA:1$smdp.example.com$MATCH-001' } as never,
    );
    await expect(service.getForUser('owner', 'order-1')).resolves.toMatchObject({
      kind: 'ready',
      testData: false,
      destination: 'Nhật Bản',
      installSecret: null,
      qrSvg: null,
      appleSetupUrl: null,
      canRevealInstallSecret: true,
    });

    const hidden = new EsimAccountService(
      { order: { findFirst: async () => paidEsim } } as never,
      { decrypt: () => 'not-an-install-string' } as never,
    );
    await expect(hidden.getForUser('owner', 'order-1')).resolves.toMatchObject({
      kind: 'stuck',
      installSecret: null,
    });
  });

  it('admin acknowledgement does not call card fulfillment', async () => {
    const retry = jest.fn();
    const recoverInstall = jest.fn().mockResolvedValue({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    });
    const audit = jest.fn();
    const service = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        }),
      } as never,
      { retryOrderFulfillment: retry } as never,
      { record: audit } as never,
      {} as never,
      {} as never,
      { isEsimOrder: async () => true, recoverInstall } as never,
    );
    const result = await service.retryFulfillment('admin-1', 'order-1');
    expect(retry).not.toHaveBeenCalled();
    expect(recoverInstall).toHaveBeenCalledWith('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(audit.mock.calls[0][4]).toEqual(
      expect.objectContaining({
        esimRecovered: true,
        recovery: 'query_only',
        created: false,
        createOpened: false,
      }),
    );
  });

  it('enqueues only esim_queue for an eSIM order and leaves card orders on the card queue', async () => {
    const esim = { enqueueFulfillment: jest.fn().mockResolvedValue('esim-fulfill-1') };
    const provider = { enqueueFulfillment: jest.fn().mockResolvedValue('card-job') };
    const topup = { enqueueFulfillment: jest.fn().mockResolvedValue('topup-job') };
    const orders = new Map([
      ['esim-order', { orderItems: [{ variant: { type: 'ESIM' } }] }],
      ['card-order', { orderItems: [{ variant: { type: 'CARD' } }] }],
      ['topup-order', { orderItems: [{ variant: { type: 'TOPUP' } }] }],
      ['data-order', { orderItems: [{ variant: { type: 'DATA' } }] }],
    ]);
    const dispatch = new FulfillmentDispatchService(
      { findOrderForFulfillment: async (id: string) => orders.get(id) } as never,
      provider as never,
      topup as never,
      {} as never,
      {} as never,
      esim as never,
    );
    expect(await dispatch.dispatchOrderFulfillment('esim-order')).toEqual(['esim-fulfill-1']);
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    await dispatch.dispatchOrderFulfillment('card-order');
    expect(provider.enqueueFulfillment).toHaveBeenCalledWith('card-order', 'webhook');
    await dispatch.dispatchOrderFulfillment('topup-order');
    await dispatch.dispatchOrderFulfillment('data-order');
    expect(topup.enqueueFulfillment).toHaveBeenCalledTimes(2);
    expect(esim.enqueueFulfillment).toHaveBeenCalledTimes(1);
  });

  it('redacts install secrets from logs and email', () => {
    const secret = `${ESIM_TEST_MARKER}:req:TEST-LPA:1$test.invalid$MOCK`;
    const logged = sanitizeNotificationLogContext({
      installSecret: secret,
      note: secret,
      activationCode: secret,
      orderCode: 'CO1',
    });
    expect(JSON.stringify(logged)).not.toContain('TEST-LPA');
    expect(JSON.stringify(logged)).not.toContain(ESIM_TEST_MARKER);
    expect(logged.orderCode).toBe('CO1');
    const mail = renderEmailTemplate('ESIM_TEST_READY', {
      orderCode: 'CO1',
      installSecret: secret,
    });
    expect(mail.html).not.toContain('TEST-LPA');
    expect(mail.text).not.toContain(secret);
    expect(mail.text).toContain('Không có mã cài đặt');
    const ready = renderEmailTemplate('ESIM_READY', {
      orderCode: 'CO1',
      installSecret: secret,
      accountUrl: 'http://localhost/tai-khoan/esim',
    });
    expect(ready.html).not.toContain('TEST-LPA');
    expect(ready.text).not.toContain(secret);
    expect(ready.text).toContain('Không có mã cài đặt');
    const sandbox = renderEmailTemplate('ESIM_SANDBOX_READY', {
      orderCode: 'CO1',
      installSecret: secret,
      accountUrl: 'http://localhost/tai-khoan/esim',
    });
    expect(sandbox.subject).toContain('[TEST]');
    expect(sandbox.html).not.toContain('TEST-LPA');
    expect(sandbox.text).not.toContain(secret);
    expect(sandbox.text).toContain('Không có mã cài đặt');
  });

  it('uses a stable esim job id', async () => {
    const add = jest
      .fn()
      .mockResolvedValueOnce({ id: 'esim-fulfill-order-1' })
      .mockRejectedValueOnce(new Error('Job is already exist'));
    const producer = new EsimQueueProducer({ add } as never);
    await expect(producer.enqueueFulfillment('order-1')).resolves.toBe('esim-fulfill-order-1');
    await expect(producer.enqueueFulfillment('order-1')).resolves.toBe('esim-fulfill-order-1');
    expect(add.mock.calls[0][2].jobId).toBe('esim-fulfill-order-1');
    expect(add.mock.calls[0][2].attempts).toBe(1);
    expect(String(add.mock.calls[0][2].jobId)).not.toContain(String(Date.now()).slice(0, 4));
    const producerSource = readFileSync(join(root, 'src/modules/esim/esim-queue.producer.ts'), 'utf8');
    const queueSource = readFileSync(join(root, 'src/queue/queue.module.ts'), 'utf8');
    expect(producerSource).toContain('const jobId = `esim-fulfill-${orderId}`');
    expect(producerSource).toContain('attempts: 1');
    expect(queueSource).toMatch(/const ESIM_QUEUE_JOB_OPTIONS = \{[\s\S]*?attempts: 1/);
  });

  it('alerts an eSIM paid order without using the card message', async () => {
    const dispatch = jest.fn();
    const old = new Date(Date.now() - 30 * 60 * 1000);
    const service = new PaidOrderWatchdogService(
      {
        findAnomalies: async () => [
          {
            id: 'order-1',
            orderCode: 'CO-ESIM',
            fulfillmentStatus: FulfillmentStatus.PENDING,
            createdAt: old,
            updatedAt: old,
            totalAmount: { toString: () => '1' },
            paymentMethodCode: 'SEPAY',
            channel: 'B2C',
            financialTransaction: null,
            activePayment: { paidAt: old },
            orderItems: [{ variant: { type: 'ESIM' } }],
            providerTransactions: [],
          },
        ],
        findPaymentSuccessOrderNotPaid: async () => [],
        hasRecentAlert: async () => false,
      } as never,
      { dispatch } as never,
    );
    await service.scan(new Date());
    expect(dispatch.mock.calls[0][0].message).toContain('eSIM mô phỏng');
    expect(dispatch.mock.calls[0][0].message).not.toContain('không có item CARD/TOPUP/DATA');
  });
});

describe('B3.23 uncertain open CREATE', () => {
  function seedUncertainCreate() {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: null });
    store.createGuards.set('attempt-1', 'item-1');
    store.createOutcomes.set('attempt-1', 'SENT');
    return store;
  }

  it('marks an open SENT create without a reference for manual review and keeps the guard', async () => {
    const store = seedUncertainCreate();
    const port = closedPort();
    const { service, mock } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.created).toBe(false);
    expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(store.open.has('item-1')).toBe(true);
    expect(store.creates).toHaveLength(0);
    expect(store.profiles.size).toBe(0);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
    expect(mock.createCount).toBe(0);
  });

  it('does not open a second CREATE when the worker runs again', async () => {
    const store = seedUncertainCreate();
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await service.fulfill('order-1');
    await service.fulfill('order-1');
    await service.fulfill('order-1');
    expect(store.creates).toHaveLength(0);
    expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.reviewWrites).toBeGreaterThan(0);
  });

  it('does not use the missing-reference sync when the open CREATE already has a reference', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    store.createGuards.set('attempt-1', 'item-1');
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(store.status).toBe(FulfillmentStatus.PENDING);
    expect(store.reviewWrites).toBe(0);
    expect(store.creates).toHaveLength(0);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
  });

  it('does not treat an open QUERY as a CREATE that lost its reference', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: 'ord-1' });
    store.createGuards.set('attempt-1', 'item-1');
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    store.queries.push({
      attemptId: 'query-stuck',
      requestId: 'esim-query-item-1-query-stuck',
      operation: 'QUERY',
      providerReference: 'ord-1',
      openGuard: 'attempt-1',
    });
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await service.fulfill('order-1');
    expect(store.reviewWrites).toBe(0);
    expect(store.creates).toHaveLength(0);
    expect(store.queries).toHaveLength(1);
    expect(store.queries[0].openGuard).toBe('attempt-1');
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
  });

  it('does not create when the review status write fails', async () => {
    const store = seedUncertainCreate();
    store.failReview = true;
    const port = closedPort();
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    await expect(service.fulfill('order-1')).rejects.toThrow(
      'Order status could not be marked for review',
    );
    expect(store.status).toBe(FulfillmentStatus.PENDING);
    expect(store.creates).toHaveLength(0);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getOrder).not.toHaveBeenCalled();
  });

  it('does not complete the order when the provider status is completed', async () => {
    const store = new MemoryFulfillmentStore();
    store.findQuoteByOrderId = async () => quote('LIVE');
    const port = closedPort();
    port.createOrder.mockResolvedValue({ orderReference: 'ord-1', status: 'completed' });
    const { service } = fulfillment(store, new EsimMockAdapter(), port);
    const result = await service.fulfill('order-1');
    const again = await service.fulfill('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(again.created).toBe(false);
    expect(store.status).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(store.status).not.toBe(FulfillmentStatus.COMPLETED);
    expect(store.profiles.size).toBe(0);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
    expect(store.createGuards.get('attempt-1')).toBe('item-1');
  });

  it('selects only an open CREATE and does not clear its guard when marking review', async () => {
    const createdAt = new Date('2026-10-24T15:46:00.000Z');
    const findFirst = jest.fn().mockResolvedValue({
      id: 'attempt-1',
      outcome: 'SENT',
      providerReference: null,
      openGuard: 'item-1',
      createdAt,
    });
    const reader = new EsimFulfillmentRepository({
      esimProviderAttempt: { findFirst },
    } as never);
    await expect(reader.findOpenCreate('item-1')).resolves.toEqual({
      attemptId: 'attempt-1',
      outcome: 'SENT',
      providerReference: null,
      openGuard: 'item-1',
      createdAt,
      safeResponseMeta: null,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { orderItemId: 'item-1', operation: 'CREATE', openGuard: 'item-1' },
      select: {
        id: true,
        outcome: true,
        providerReference: true,
        openGuard: true,
        createdAt: true,
        safeResponseMeta: true,
      },
    });

    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const attemptUpdate = jest.fn();
    const writer = new EsimFulfillmentRepository({
      orderItem: { findUnique: async () => ({ orderId: 'order-1' }) },
      order: { updateMany, findUnique: jest.fn() },
      esimProviderAttempt: { update: attemptUpdate },
    } as never);
    await expect(writer.markNeedsReview('item-1')).resolves.toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        fulfillmentStatus: {
          in: [FulfillmentStatus.PENDING, FulfillmentStatus.PROCESSING],
        },
      },
      data: { fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW },
    });
    expect(attemptUpdate).not.toHaveBeenCalled();
  });
});

describe('manual QUERY claim close', () => {
  function harness(options?: {
    failAudit?: boolean;
    queryOpenGuard?: string;
    outcome?: 'SENT' | 'UNCONFIRMED';
    probe?: 'idle' | 'missing' | 'busy' | 'unverified';
    lease?: 'ABSENT' | 'PRESENT' | 'UNKNOWN' | 'missing';
  }) {
    const query = {
      id: 'query-1',
      operation: 'QUERY' as const,
      outcome: options?.outcome ?? 'SENT',
      openGuard: options?.queryOpenGuard ?? 'create-1',
      orderItemId: 'item-1',
    };
    const create = {
      id: 'create-1',
      operation: 'CREATE' as const,
      openGuard: 'item-1',
      orderItemId: 'item-1',
    };
    const audits: Array<Record<string, unknown>> = [];
    const attemptUpdates: unknown[] = [];
    const orderUpdates: unknown[] = [];
    const profiles: unknown[] = [];
    const tx = {
      esimProviderAttempt: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === query.id ? { ...query } : null,
        findFirst: async ({ where }: { where: { id: string; operation: string; orderItemId: string } }) => {
          if (where.id === create.id && where.operation === 'CREATE' && where.orderItemId === query.orderItemId) {
            return { ...create };
          }
          return null;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: { id: string; operation: string; outcome: string; openGuard: string; orderItemId: string };
          data: { outcome: string; openGuard: null };
        }) => {
          attemptUpdates.push({ where, data });
          if (
            query.id === where.id &&
            query.operation === where.operation &&
            query.outcome === where.outcome &&
            query.openGuard === where.openGuard &&
            query.orderItemId === where.orderItemId
          ) {
            query.outcome = data.outcome as 'UNCONFIRMED';
            query.openGuard = data.openGuard as unknown as string;
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
      orderItem: {
        findFirst: async ({ where }: { where: { id: string; orderId: string } }) =>
          where.id === query.orderItemId && where.orderId === 'order-1' ? { id: query.orderItemId } : null,
      },
      order: { update: async (args: unknown) => { orderUpdates.push(args); } },
      esimProfile: { create: async (args: unknown) => { profiles.push(args); } },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          if (options?.failAudit) throw new Error('audit failed');
          audits.push(data);
          return data;
        },
      },
    };
    const prisma = {
      esimProviderAttempt: tx.esimProviderAttempt,
      orderItem: tx.orderItem,
      $transaction: async (fn: (client: typeof tx) => Promise<{ result: 'closed' | 'not_closed' }>) => {
        const snapshot = { outcome: query.outcome, openGuard: query.openGuard };
        try {
          return await fn(tx);
        } catch (error) {
          query.outcome = snapshot.outcome;
          query.openGuard = snapshot.openGuard;
          throw error;
        }
      },
    };
    const fulfillment = new EsimFulfillmentRepository({} as never);
    const probeMode = options?.probe ?? 'idle';
    const probe =
      probeMode === 'missing'
        ? undefined
        : {
            assertIdle: async () => {
              if (probeMode === 'busy') {
                throw new BadRequestException(ESIM_QUERY_CLAIM_BUSY);
              }
              if (probeMode === 'unverified') {
                throw new BadRequestException(ESIM_QUERY_CLAIM_UNVERIFIED);
              }
            },
          };
    const leaseMode = options?.lease ?? 'ABSENT';
    const getLease =
      leaseMode === 'missing'
        ? undefined
        : {
            inspect: async () => leaseMode,
          };
    const esimAdmin = new EsimAdminService(
      prisma as never,
      fulfillment,
      undefined,
      undefined,
      undefined,
      probe as never,
      getLease as never,
    );
    const orders = new AdminOrderService(
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
      esimAdmin,
    );
    return { query, create, audits, attemptUpdates, orderUpdates, profiles, orders, esimAdmin };
  }

  const input = {
    orderId: 'order-1',
    queryAttemptId: 'query-1',
    createAttemptId: 'create-1',
    reason: ' worker process confirmed dead ',
  };

  it('refuses to close a matching QUERY claim when the GET lease is absent', async () => {
    const { query, create, audits, orderUpdates, profiles, orders } = harness();
    await expect(orders.closeEsimQueryClaim(' admin-1 ', input)).rejects.toThrow(
      ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF,
    );
    expect(query.outcome).toBe('SENT');
    expect(query.openGuard).toBe('create-1');
    expect(create.openGuard).toBe('item-1');
    expect(audits).toHaveLength(0);
    expect(orderUpdates).toHaveLength(0);
    expect(profiles).toHaveLength(0);
  });

  it('refuses to close when the GET lease is present or unknown', async () => {
    await expect(
      harness({ lease: 'PRESENT' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_LEASE_PRESENT);
    await expect(
      harness({ lease: 'UNKNOWN' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_LEASE_UNKNOWN);
    await expect(
      harness({ lease: 'missing' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_LEASE_UNKNOWN);
    expect(harness({ lease: 'PRESENT' }).query.outcome).toBe('SENT');
  });

  it('does not release a claim when the QUERY id, CREATE id, guard, or outcome does not match', async () => {
    const wrongQuery = harness();
    await expect(
      wrongQuery.orders.closeEsimQueryClaim('admin-1', { ...input, queryAttemptId: 'query-missing' }),
    ).resolves.toEqual({ result: 'not_closed' });
    expect(wrongQuery.query.outcome).toBe('SENT');
    expect(wrongQuery.query.openGuard).toBe('create-1');
    expect(wrongQuery.attemptUpdates).toHaveLength(0);

    const wrongCreate = harness();
    await expect(
      wrongCreate.orders.closeEsimQueryClaim('admin-1', { ...input, createAttemptId: 'create-missing' }),
    ).resolves.toEqual({ result: 'not_closed' });
    expect(wrongCreate.query.openGuard).toBe('create-1');

    const wrongGuard = harness({ queryOpenGuard: 'other-attempt' });
    await expect(wrongGuard.orders.closeEsimQueryClaim('admin-1', input)).resolves.toEqual({ result: 'not_closed' });
    expect(wrongGuard.query.openGuard).toBe('other-attempt');

    const alreadyClosed = harness({ outcome: 'UNCONFIRMED' });
    await expect(alreadyClosed.orders.closeEsimQueryClaim('admin-1', input)).resolves.toEqual({ result: 'not_closed' });
    expect(alreadyClosed.query.outcome).toBe('UNCONFIRMED');
    expect(alreadyClosed.create.openGuard).toBe('item-1');
    expect(wrongQuery.audits).toHaveLength(0);
  });

  it('does not close either of two concurrent matching claims', async () => {
    const { query, create, audits, esimAdmin } = harness();
    await expect(
      Promise.all([
        esimAdmin.closeSentQueryClaim({ adminId: 'admin-1', ...input }),
        esimAdmin.closeSentQueryClaim({ adminId: 'admin-2', ...input }),
      ]),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF);
    expect(query.outcome).toBe('SENT');
    expect(query.openGuard).toBe('create-1');
    expect(create.openGuard).toBe('item-1');
    expect(audits).toHaveLength(0);
  });

  it('does not mutate the claim when auto-close is refused', async () => {
    const { query, esimAdmin } = harness({ failAudit: true });
    await expect(
      esimAdmin.closeSentQueryClaim({ adminId: 'admin-1', ...input }),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF);
    expect(query.outcome).toBe('SENT');
    expect(query.openGuard).toBe('create-1');
  });

  it('rejects a blank reason or a blank admin before touching the claim', async () => {
    const { query, orders } = harness();
    await expect(orders.closeEsimQueryClaim('   ', input)).rejects.toBeInstanceOf(BadRequestException);
    await expect(orders.closeEsimQueryClaim('admin-1', { ...input, reason: '   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(query.outcome).toBe('SENT');
    expect(query.openGuard).toBe('create-1');
  });

  it('refuses to close when the QUERY request cannot be verified idle', async () => {
    for (const probe of ['missing', 'busy', 'unverified'] as const) {
      const { query, create, audits, orders } = harness({ probe });
      await expect(orders.closeEsimQueryClaim('admin-1', input)).rejects.toBeInstanceOf(BadRequestException);
      expect(query.outcome).toBe('SENT');
      expect(query.openGuard).toBe('create-1');
      expect(create.openGuard).toBe('item-1');
      expect(audits).toHaveLength(0);
    }
  });

  it('refuses busy and unverified probes with the operational messages', async () => {
    await expect(
      harness({ probe: 'busy' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_BUSY);
    await expect(
      harness({ probe: 'unverified' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_UNVERIFIED);
    await expect(
      harness({ probe: 'missing' }).orders.closeEsimQueryClaim('admin-1', input),
    ).rejects.toThrow(ESIM_QUERY_CLAIM_UNVERIFIED);
  });

  it('updates only the QUERY row predicates and does not touch the CREATE guard', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new EsimFulfillmentRepository({} as never);
    await expect(repository.closeSentQueryClaim({ esimProviderAttempt: { updateMany } } as never, {
      queryAttemptId: 'query-1',
      createAttemptId: 'create-1',
      orderItemId: 'item-1',
    })).resolves.toBe(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'query-1',
        operation: 'QUERY',
        outcome: 'SENT',
        openGuard: 'create-1',
        orderItemId: 'item-1',
      },
      data: expect.objectContaining({
        outcome: 'UNCONFIRMED',
        openGuard: null,
      }),
    });
    expect(JSON.stringify(updateMany.mock.calls[0][0].where)).not.toContain('CREATE');
  });
});

describe('B3.49 legacy dispatch boundaries', () => {
  function dispatchFor(orders: Map<string, { orderItems: Array<{ variant: { type: string } }> }>) {
    const esim = { enqueueFulfillment: jest.fn().mockResolvedValue('esim-job') };
    const provider = { enqueueFulfillment: jest.fn().mockResolvedValue('card-job') };
    const topup = { enqueueFulfillment: jest.fn().mockResolvedValue('topup-job') };
    const providerService = { retryFulfillment: jest.fn().mockResolvedValue('card-retry') };
    const topupService = { retryFulfillment: jest.fn().mockResolvedValue('topup-retry') };
    const service = new FulfillmentDispatchService(
      { findOrderForFulfillment: async (id: string) => orders.get(id) ?? null } as never,
      provider as never,
      topup as never,
      providerService as never,
      topupService as never,
      esim as never,
    );
    return { service, esim, provider, topup, providerService, topupService };
  }

  it('sends GAME_CARD and PHONE_CARD orders to provider_queue only', async () => {
    const { service, esim, provider, topup } = dispatchFor(new Map([
      ['game', { orderItems: [{ variant: { type: 'CARD' } }] }],
      ['phone', { orderItems: [{ variant: { type: 'CARD' } }] }],
    ]));
    await service.dispatchOrderFulfillment('game');
    await service.dispatchOrderFulfillment('phone');
    expect(provider.enqueueFulfillment).toHaveBeenNthCalledWith(1, 'game', 'webhook');
    expect(provider.enqueueFulfillment).toHaveBeenNthCalledWith(2, 'phone', 'webhook');
    expect(topup.enqueueFulfillment).not.toHaveBeenCalled();
    expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
  });

  it('sends TOPUP and DATA orders to topup_queue only', async () => {
    const { service, esim, provider, topup } = dispatchFor(new Map([
      ['topup', { orderItems: [{ variant: { type: 'TOPUP' } }] }],
      ['data', { orderItems: [{ variant: { type: 'DATA' } }] }],
    ]));
    await service.dispatchOrderFulfillment('topup');
    await service.dispatchOrderFulfillment('data');
    expect(topup.enqueueFulfillment).toHaveBeenNthCalledWith(1, 'topup', 'webhook');
    expect(topup.enqueueFulfillment).toHaveBeenNthCalledWith(2, 'data', 'webhook');
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
  });

  it('retries a legacy card order through the card provider, not the eSIM queue', async () => {
    const { service, esim, provider, providerService, topupService } = dispatchFor(new Map([
      ['card', { orderItems: [{ variant: { type: 'CARD' } }] }],
    ]));
    await expect(service.retryOrderFulfillment('card')).resolves.toBe('card-retry');
    expect(providerService.retryFulfillment).toHaveBeenCalledWith('card');
    expect(topupService.retryFulfillment).not.toHaveBeenCalled();
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
  });

  it.each(['TOPUP', 'DATA'] as const)('retries a %s-only order through the topup provider', async (type) => {
    const { service, esim, provider, providerService, topupService } = dispatchFor(new Map([
      ['legacy', { orderItems: [{ variant: { type } }] }],
    ]));
    await expect(service.retryOrderFulfillment('legacy')).resolves.toBe('topup-retry');
    expect(topupService.retryFulfillment).toHaveBeenCalledWith('legacy');
    expect(providerService.retryFulfillment).not.toHaveBeenCalled();
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
  });

  it('dispatches an eSIM-only order through esim_queue', async () => {
    const { service, esim, provider, topup } = dispatchFor(new Map([
      ['esim', { orderItems: [{ variant: { type: 'ESIM' } }] }],
    ]));
    await expect(service.dispatchOrderFulfillment('esim')).resolves.toEqual(['esim-job']);
    expect(esim.enqueueFulfillment).toHaveBeenCalledWith('esim');
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    expect(topup.enqueueFulfillment).not.toHaveBeenCalled();
  });

  it.each(['CARD', 'TOPUP', 'DATA'] as const)(
    'rejects a persisted ESIM + %s order before any queue call',
    async (legacyType) => {
      const { service, esim, provider, topup, providerService, topupService } = dispatchFor(new Map([
        ['mixed', {
          orderItems: [
            { variant: { type: 'ESIM' } },
            { variant: { type: legacyType } },
          ],
        }],
      ]));
      await expect(service.dispatchOrderFulfillment('mixed')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.retryOrderFulfillment('mixed')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.dispatchOrderFulfillment('mixed')).rejects.toThrow(
        'eSIM orders cannot include other product types',
      );
      expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
      expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
      expect(topup.enqueueFulfillment).not.toHaveBeenCalled();
      expect(providerService.retryFulfillment).not.toHaveBeenCalled();
      expect(topupService.retryFulfillment).not.toHaveBeenCalled();
    },
  );
});

describe('Phase A route protection', () => {
  it('does not add eSIM to CheckoutShell or the existing purchase routes', () => {
    const files = [
      'apps/web/components/checkout/CheckoutShell.tsx',
      'apps/web/lib/checkout-services.ts',
      'apps/web/app/(mua-hang)/the-game/page.tsx',
      'apps/web/app/(mua-hang)/the-dien-thoai/page.tsx',
      'apps/web/app/(mua-hang)/nap-cuoc/page.tsx',
      'apps/web/app/(mua-hang)/nap-data/page.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(join(root, file), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*esim/);
      expect(source).not.toMatch(/['"`]\/esim(?:\/|['"`])/);
    }
    const preview = readFileSync(join(root, 'apps/web/app/esim/page.tsx'), 'utf8');
    expect(preview).not.toContain('/payments');
    expect(preview).toContain('listEsimPreviewOffers');
  });
});
