import { FulfillmentStatus, Prisma } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AiraloRequestError } from './esim-airalo.adapter';
import { EsimAdminService } from './esim-admin.service';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import { EsimFulfillmentService, EsimQuoteRow } from './esim-fulfillment.service';
import { EsimMockAdapter } from './esim-mock.adapter';
import { EsimProviderPort } from './esim-provider.port';
import { AdminOrderService } from '../admin/services/admin-order.service';
import { OrderPaymentStatus } from '@prisma/client';

const FIXTURE = 'LPA:1$smdp.example.test$FIXTURE-K5';
const root = join(__dirname, '../../..');

function quote(mode: EsimQuoteRow['providerMode'] = 'LIVE'): EsimQuoteRow {
  return {
    quoteId: 'quote-1',
    orderItemId: 'item-1',
    providerId: 'provider-1',
    providerProductCode: 'pkg-1',
    providerMode: mode,
  };
}

class MemoryStore {
  profiles = new Set<string>();
  open = new Set<string>();
  creates: string[] = [];
  reviews = 0;
  failSave = false;
  failClaim = false;
  status: FulfillmentStatus = FulfillmentStatus.PENDING;
  statusReads = 0;
  flipToReviewAfterReads: number | null = null;
  references = new Map<
    string,
    { attemptId: string; providerReference: string | null; safeResponseMeta?: Record<string, unknown> }
  >();
  createOutcomes = new Map<string, string>();
  openGuards = new Map<string, string>();
  queryLocked = false;
  queryClaims = 0;
  closedQueryAttempts: string[] = [];
  slowSaveMs = 0;
  markUnconfirmedCalls = 0;

  async findQuoteByOrderId() {
    return quote();
  }
  async getOrderFulfillmentStatus() {
    this.statusReads += 1;
    if (this.flipToReviewAfterReads === this.statusReads) {
      this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    }
    return this.status;
  }
  paymentStatus: 'WAITING_PAYMENT' | 'PAID' = 'WAITING_PAYMENT';
  async claimFirstCreate() {
    if (this.failClaim) {
      throw new Error('claim write failed');
    }
    if (
      this.status !== FulfillmentStatus.PENDING &&
      this.status !== FulfillmentStatus.WAITING_ADMIN_RETRY
    ) {
      return false;
    }
    this.status = FulfillmentStatus.PROCESSING;
    return true;
  }
  async getOrderPaymentFulfillment() {
    return { paymentStatus: this.paymentStatus, fulfillmentStatus: this.status };
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
      openGuard: this.openGuards.get(orderItemId) ?? orderItemId,
      createdAt: new Date('2026-10-24T15:46:00.000Z'),
      safeResponseMeta: row.safeResponseMeta ?? null,
    };
  }
  async insertQuery() {
    if (this.queryLocked) {
      return 'conflict' as const;
    }
    this.queryLocked = true;
    this.queryClaims += 1;
    return { attemptId: `query-${this.queryClaims}`, requestId: `qreq-${this.queryClaims}` };
  }
  async closeQueryAttempt(input?: { attemptId?: string }) {
    if (input?.attemptId) {
      this.closedQueryAttempts.push(input.attemptId);
    }
    this.queryLocked = false;
  }
  async findOpenCreateReference(orderItemId: string) {
    return this.findOpenCreate(orderItemId);
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
  async saveCreateReference(input: { attemptId: string; orderItemId: string; providerReference: string }) {
    const current = this.references.get(input.orderItemId);
    if (current) current.providerReference = input.providerReference;
    this.createOutcomes.set(input.attemptId, 'UNCONFIRMED');
    this.open.add(input.orderItemId);
  }
  async saveProfile(input: { orderItemId: string; attemptId?: string }) {
    if (this.failSave) {
      throw new Error('profile persist failed');
    }
    if (this.profiles.has(input.orderItemId)) {
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    }
    if (this.slowSaveMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.slowSaveMs));
      if (this.profiles.has(input.orderItemId)) {
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }
    }
    this.profiles.add(input.orderItemId);
    this.open.delete(input.orderItemId);
    this.status = FulfillmentStatus.COMPLETED;
    this.createOutcomes.set(input.attemptId ?? 'attempt-1', 'PROFILE_SAVED');
  }
  async markUnconfirmed(attemptId: string, orderItemId: string) {
    this.markUnconfirmedCalls += 1;
    if (this.profiles.has(orderItemId) || this.status === FulfillmentStatus.COMPLETED) {
      return;
    }
    this.createOutcomes.set(attemptId, 'UNCONFIRMED');
    this.open.add(orderItemId);
  }
  async markNeedsReview() {
    this.reviews += 1;
    return FulfillmentStatus.NEED_MANUAL_REVIEW;
  }
  async ensureManualReview() {
    this.reviews += 1;
    this.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    return FulfillmentStatus.NEED_MANUAL_REVIEW;
  }
  async notifyDelivered() {}
  events: string[] = [];
  async recordOrderEvent(_orderId?: string, _type?: string, message?: string) {
    if (message) this.events.push(message);
  }
}

function livePort(options: {
  createOrder?: EsimProviderPort['createOrder'];
  getInstallDetails?: EsimProviderPort['getInstallDetails'];
}) {
  const fail = async () => {
    throw new Error('must not be called');
  };
  return {
    listBundles: jest.fn(fail),
    getBundle: jest.fn(fail),
    listPrices: jest.fn(fail),
    validateOrder: jest.fn(fail),
    createOrder: jest.fn(options.createOrder ?? fail),
    getOrder: jest.fn(async () => ({})),
    getInstallDetails: options.getInstallDetails ? jest.fn(options.getInstallDetails) : jest.fn(fail),
  };
}

export { MemoryStore, livePort, service, FIXTURE };

function service(
  store: MemoryStore,
  port: ReturnType<typeof livePort>,
  lease = new EsimGetLease(new MemoryEsimLeaseRedis()),
) {
  return new EsimFulfillmentService(
    store as never,
    new EsimMockAdapter(),
    port as never,
    { encrypt: (value: string) => `enc:${value}` } as never,
    undefined,
    undefined,
    lease,
  );
}

describe('LPA-16K5 recoverInstall is QUERY-only', () => {
  it('does not call fulfill() from recoverInstall source', () => {
    const admin = readFileSync(join(root, 'src/modules/esim/esim-admin.service.ts'), 'utf8');
    const recover = admin.slice(
      admin.indexOf('QUERY/GET a stored Airalo CREATE'),
      admin.indexOf('async getOrderOps'),
    );
    expect(recover).toContain('recoverExistingInstall');
    expect(recover).not.toContain('.fulfill(');
    expect(recover).toContain('Never opens POST /v2/orders');
  });

  it('1. has profile: no provider CREATE or GET', async () => {
    const store = new MemoryStore();
    store.profiles.add('item-1');
    const port = livePort({});
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('2. stored reference: GET only, never CREATE', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(result.hasReference).toBe(true);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalledWith('104159');
    expect(store.creates).toHaveLength(0);
    expect(store.profiles.has('item-1')).toBe(true);
  });

  it('3. open CREATE without reference: manual review, no CREATE', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: null });
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    const port = livePort({});
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.created).toBe(false);
    expect(result.hasOpenCreate).toBe(true);
    expect(result.hasReference).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
    expect(store.creates).toHaveLength(0);
  });

  it('4. no attempt or profile: manual review, no CREATE', async () => {
    const store = new MemoryStore();
    const port = livePort({});
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result).toEqual({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    });
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
    expect(store.reviews).toBe(1);
    const recoverSrc = readFileSync(join(root, 'src/modules/esim/esim-admin.service.ts'), 'utf8');
    const recoverFn = recoverSrc.slice(
      recoverSrc.indexOf('async recoverInstall'),
      recoverSrc.indexOf('async getOrderOps'),
    );
    expect(recoverFn).not.toContain('enqueueFulfillment');
    expect(recoverFn).not.toContain('dispatchOrderFulfillment');
  });

  it('fulfill() after unclaimed recover does not CREATE because review is not this worker claim', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const admin = new EsimAdminService({} as never, store as never, fulfillment);
    const recovered = await admin.recoverInstall('order-1');
    expect(recovered.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(recovered.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    const worker = await fulfillment.fulfill('order-1');
    expect(worker.created).toBe(false);
    expect(worker.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('5. unclear CREATE (timeout/unconfirmed, no ref) does not CREATE again', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: null });
    store.createOutcomes.set('attempt-1', 'UNCONFIRMED');
    const port = livePort({
      createOrder: async () => ({ orderReference: 'should-not-create' }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const first = await admin.recoverInstall('order-1');
    const second = await admin.recoverInstall('order-1');
    expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(second.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
  });

  it('6. GET 422 / not found does not CREATE', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    const port = livePort({
      getInstallDetails: async () => {
        throw new AiraloRequestError('Airalo request failed with status 422 (code 422)', 422);
      },
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
    expect(store.profiles.size).toBe(0);
  });

  it('7. worker fulfill still CREATE on first attempt', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const result = await fulfillment.fulfill('order-1');
    expect(result.created).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
    expect(store.profiles.has('item-1')).toBe(true);
    expect(store.open.has('item-1')).toBe(false);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
  });

  it('LIVE worker CREATE then saveProfile reject stays in catch, keeps guard and ref, recover is GET-only', async () => {
    const store = new MemoryStore();
    store.failSave = true;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const first = await fulfillment.fulfill('order-1');
    expect(first.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(first.created).toBe(false);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    const admin = new EsimAdminService({} as never, store as never, fulfillment);
    const recovered = await admin.recoverInstall('order-1');
    expect(recovered.created).toBe(false);
    expect(recovered.queried).toBe(true);
    expect(recovered.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(port.getInstallDetails).toHaveBeenCalledWith('104159');
    expect(store.open.has('item-1')).toBe(true);
    expect(store.profiles.size).toBe(0);
    const again = await fulfillment.fulfill('order-1');
    expect(again.created).toBe(false);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
  });

  it('8. concurrent recoveries never POST', async () => {
    const store = new MemoryStore();
    const port = livePort({});
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const [a, b] = await Promise.all([admin.recoverInstall('order-1'), admin.recoverInstall('order-1')]);
    expect(a.created).toBe(false);
    expect(b.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('GET success then saveProfile reject stays review, keeps guard, never CREATE', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    store.failSave = true;
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(result.hasOpenCreate).toBe(true);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalled();
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.creates).toHaveLength(0);
    const again = await admin.recoverInstall('order-1');
    expect(again.created).toBe(false);
    expect(again.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
  });

  it('9. admin retry audit is query-only and has no secret keys', async () => {
    const recoverInstall = jest.fn().mockResolvedValue({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: true,
      hasOpenCreate: true,
      hasReference: true,
    });
    const audit = jest.fn();
    const orders = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        }),
      } as never,
      { retryOrderFulfillment: jest.fn() } as never,
      { record: audit } as never,
      {} as never,
      {} as never,
      { isEsimOrder: async () => true, recoverInstall } as never,
    );
    await orders.retryFulfillment('admin-1', 'order-1');
    const metadata = audit.mock.calls[0][4] as Record<string, unknown>;
    expect(metadata).toEqual({
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      esimRecovered: true,
      recovery: 'query_only',
      created: false,
      createOpened: false,
      queried: true,
      hasOpenCreate: true,
      hasReference: true,
    });
    expect(JSON.stringify(metadata)).not.toMatch(/LPA:1\$|qrSvg|appleSetupUrl|installSecret|FIXTURE-K5/);
  });

  it('audit query_only is a contract label and queried follows the service result', async () => {
    const recoverInstall = jest.fn().mockResolvedValue({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    });
    const audit = jest.fn();
    const orders = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PENDING,
        }),
      } as never,
      { retryOrderFulfillment: jest.fn() } as never,
      { record: audit } as never,
      {} as never,
      {} as never,
      { isEsimOrder: async () => true, recoverInstall } as never,
    );
    await orders.retryFulfillment('admin-1', 'order-1');
    const metadata = audit.mock.calls[0][4] as Record<string, unknown>;
    expect(metadata.recovery).toBe('query_only');
    expect(metadata.queried).toBe(false);
    expect(metadata.created).toBe(false);
    expect(metadata.createOpened).toBe(false);
    expect(JSON.stringify(metadata)).not.toMatch(/LPA:1\$|qrSvg|appleSetupUrl|installSecret/);
  });
});

function seedOpenRef(store: MemoryStore, ref = '104159') {
  store.status = FulfillmentStatus.PROCESSING;
  store.open.add('item-1');
  store.references.set('item-1', { attemptId: 'attempt-1', providerReference: ref });
  store.openGuards.set('item-1', 'item-1');
}

describe('LPA-16K25 recovery concurrency A+C+B', () => {
  it('source resumeExistingCreate claims QUERY before GET and never CREATE', () => {
    const fulfill = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8');
    const start = fulfill.indexOf('private async resumeExistingCreate');
    const end = fulfill.indexOf('private async refuseFirstCreateIfBlocked');
    const body = fulfill.slice(start, end === -1 ? fulfill.length : end);
    expect(body.indexOf('insertQuery')).toBeGreaterThan(-1);
    expect(body.indexOf('insertQuery')).toBeLessThan(body.indexOf('recoverLiveInstall'));
    expect(body).toContain('closeQueryAttempt');
    expect(body).not.toContain('createOrder');
    expect(body).not.toContain('.fulfill(');
  });

  it('1. admin recovery obtains a QUERY claim before GET', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(store.queryClaims).toBe(1);
    expect(port.getInstallDetails).toHaveBeenCalledTimes(1);
    expect(result.queried).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('2. existing QUERY claim causes conflict and zero provider GET calls', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.queryLocked = true;
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(result.hasOpenCreate).toBe(true);
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(store.createOutcomes.get('attempt-1') ?? 'SENT').toBe('SENT');
  });

  it('3. admin recovery remains query-only', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfill = service(store, port);
    const fulfillSpy = jest.spyOn(fulfill, 'fulfill');
    const admin = new EsimAdminService({} as never, store as never, fulfill);
    await admin.recoverInstall('order-1');
    expect(fulfillSpy).not.toHaveBeenCalled();
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('4+5. P2002 after a completed profile does not markUnconfirmed or downgrade', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.saveProfile = async () => {
      store.profiles.add('item-1');
      store.status = FulfillmentStatus.COMPLETED;
      store.createOutcomes.set('attempt-1', 'PROFILE_SAVED');
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    };
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(store.status).toBe(FulfillmentStatus.COMPLETED);
    expect(store.createOutcomes.get('attempt-1')).toBe('PROFILE_SAVED');
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(store.markUnconfirmedCalls).toBe(0);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('6. non-race persist failure still fails safe and keeps CREATE guard', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.failSave = true;
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const admin = new EsimAdminService({} as never, store as never, service(store, port));
    const result = await admin.recoverInstall('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(store.profiles.size).toBe(0);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(store.markUnconfirmedCalls).toBe(1);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('7. CREATE guard and provider reference remain unchanged on claim conflict', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.queryLocked = true;
    store.createOutcomes.set('attempt-1', 'SENT');
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    await new EsimAdminService({} as never, store as never, service(store, port)).recoverInstall('order-1');
    expect(store.open.has('item-1')).toBe(true);
    expect(store.openGuards.get('item-1') ?? 'item-1').toBe('item-1');
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(store.createOutcomes.get('attempt-1')).toBe('SENT');
  });

  it('markUnconfirmed does not overwrite COMPLETED or a stored profile', async () => {
    const update = jest.fn();
    const updateMany = jest.fn();
    const repository = new EsimFulfillmentRepository({
      $transaction: async (fn: (tx: Record<string, unknown>) => Promise<void>) =>
        fn({
          esimProfile: { findUnique: async () => ({ id: 'profile-1' }) },
          esimProviderAttempt: { update, findUnique: async () => ({ outcome: 'PROFILE_SAVED' }) },
          orderItem: { findUnique: async () => ({ orderId: 'order-1' }) },
          order: {
            findUnique: async () => ({ fulfillmentStatus: FulfillmentStatus.COMPLETED }),
            updateMany,
          },
        }),
    } as never);
    await repository.markUnconfirmed('attempt-1', 'item-1');
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('9. fulfill resume and query-open cannot both GET', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const port = livePort({
      getInstallDetails: async () => {
        await gate;
        return { orderReference: '104159', installSecret: FIXTURE };
      },
    });
    const fulfillment = service(store, port);
    const resume = fulfillment.fulfill('order-1');
    await Promise.resolve();
    await Promise.resolve();
    const queryOpen = fulfillment.queryOpenCreateRecovery('order-1');
    release();
    const [fromFulfill, fromQuery] = await Promise.all([resume, queryOpen]);
    expect(port.getInstallDetails).toHaveBeenCalledTimes(1);
    expect([fromFulfill.queried === true, fromQuery.queried === true].filter(Boolean)).toHaveLength(1);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });
});

