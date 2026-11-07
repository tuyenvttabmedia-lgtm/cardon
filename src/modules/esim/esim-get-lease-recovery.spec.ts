import { BadRequestException } from '@nestjs/common';
import { EsimAttemptOutcome, FulfillmentStatus, Prisma } from '@prisma/client';
import { EsimAdminService } from './esim-admin.service';
import { EsimFulfillmentRepository } from './esim-fulfillment.repository';
import {
  ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF,
  ESIM_QUERY_CLAIM_LEASE_PRESENT,
  ESIM_QUERY_CLAIM_LEASE_UNKNOWN,
  EsimGetLease,
  MemoryEsimLeaseRedis,
  esimGetLeaseKey,
} from './esim-get-lease';
import { FIXTURE, livePort, MemoryStore, service } from './esim-recover-install.spec';

function seedOpenRef(store: MemoryStore, attemptId = 'attempt-1') {
  store.status = FulfillmentStatus.PROCESSING;
  store.open.add('item-1');
  store.references.set('item-1', { attemptId, providerReference: '104159' });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function hangingGet(leaseRedis = new MemoryEsimLeaseRedis()) {
  const entered = deferred<void>();
  const hang = deferred<{ orderReference: string; installSecret: string }>();
  let getCalls = 0;
  const port = livePort({
    getInstallDetails: async () => {
      getCalls += 1;
      entered.resolve();
      return hang.promise;
    },
  });
  return {
    leaseRedis,
    lease: new EsimGetLease(leaseRedis),
    port,
    entered,
    hang,
    getCalls: () => getCalls,
  };
}

function closeHarness(options: {
  lease?: EsimGetLease | { inspect: () => Promise<'PRESENT' | 'ABSENT' | 'UNKNOWN'> };
  leaseMissing?: boolean;
}) {
  const query = {
    id: 'query-1',
    orderItemId: 'item-1',
    operation: 'QUERY',
    outcome: EsimAttemptOutcome.SENT,
    openGuard: 'create-1',
  };
  const prisma = {
    esimProviderAttempt: {
      findUnique: async () => query,
      findFirst: async ({ where }: { where: { id: string } }) =>
        where.id === 'create-1' ? { id: 'create-1', openGuard: 'item-1' } : null,
    },
    orderItem: {
      findFirst: async () => ({ id: 'item-1' }),
    },
  };
  const probe = { assertIdle: async () => undefined };
  const esimAdmin = new EsimAdminService(
    prisma as never,
    new EsimFulfillmentRepository({} as never),
    undefined,
    undefined,
    undefined,
    probe as never,
    options.leaseMissing ? undefined : (options.lease as never),
  );
  return { query, esimAdmin };
}

const closeInput = {
  adminId: 'admin-1',
  orderId: 'order-1',
  queryAttemptId: 'query-1',
  createAttemptId: 'create-1',
  reason: 'ops stop',
};

describe('LPA-16K27B GET lease recovery matrix', () => {
  it('1. two recoveries share one lease: only one GET runs', async () => {
    const hang = hangingGet();
    const storeA = new MemoryStore();
    const storeB = new MemoryStore();
    seedOpenRef(storeA);
    seedOpenRef(storeB);
    const pendingA = service(storeA, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    await hang.entered.promise;
    const resultB = await service(storeB, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    expect(hang.getCalls()).toBe(1);
    expect(resultB.queried).toBe(false);
    expect(await hang.lease.inspect('attempt-1')).toBe('PRESENT');
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pendingA;
    expect(hang.getCalls()).toBe(1);
  });

  it('2. admin GET and worker GET on the same CREATE attempt do not overlap', async () => {
    const hang = hangingGet();
    const storeA = new MemoryStore();
    const storeB = new MemoryStore();
    seedOpenRef(storeA);
    seedOpenRef(storeB);
    const admin = new EsimAdminService(
      {} as never,
      storeA as never,
      service(storeA, hang.port, hang.lease),
    );
    const pendingAdmin = admin.recoverInstall('order-1');
    await hang.entered.promise;
    const worker = await service(storeB, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    expect(hang.getCalls()).toBe(1);
    expect(worker.queried).toBe(false);
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pendingAdmin;
  });

  it('3. worker QUERY GET and fulfillLive GET do not overlap', async () => {
    const hang = hangingGet();
    const createStore = new MemoryStore();
    const queryStore = new MemoryStore();
    seedOpenRef(queryStore);
    const createPort = livePort({
      createOrder: async () => ({ orderReference: '104159' }),
      getInstallDetails: hang.port.getInstallDetails,
    });
    const pendingCreate = service(createStore, createPort, hang.lease).fulfill('order-1');
    await hang.entered.promise;
    expect(createStore.creates).toEqual(['attempt-1']);
    const queryPort = livePort({
      getInstallDetails: hang.port.getInstallDetails,
    });
    const queryResult = await service(queryStore, queryPort, hang.lease).queryOpenCreateRecovery(
      'order-1',
    );
    expect(hang.getCalls()).toBe(1);
    expect(queryResult.queried).toBe(false);
    expect(createPort.createOrder).toHaveBeenCalledTimes(1);
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pendingCreate;
    expect(hang.getCalls()).toBe(1);
  });

  it('4. lease PRESENT refuses close-claim and keeps QUERY SENT', async () => {
    const redis = new MemoryEsimLeaseRedis();
    const lease = new EsimGetLease(redis);
    await lease.acquire('create-1', {
      orderId: 'order-1',
      orderItemId: 'item-1',
      queryAttemptId: 'query-1',
    });
    const { query, esimAdmin } = closeHarness({ lease });
    await expect(esimAdmin.closeSentQueryClaim(closeInput)).rejects.toThrow(
      ESIM_QUERY_CLAIM_LEASE_PRESENT,
    );
    expect(query.outcome).toBe(EsimAttemptOutcome.SENT);
    expect(query.openGuard).toBe('create-1');
  });

  it('5. Redis error on acquire does not call GET', async () => {
    const redis = new MemoryEsimLeaseRedis();
    redis.failSet = true;
    const store = new MemoryStore();
    seedOpenRef(store);
    let getCalls = 0;
    const port = livePort({
      getInstallDetails: async () => {
        getCalls += 1;
        return { orderReference: '104159', installSecret: FIXTURE };
      },
    });
    const result = await service(store, port, new EsimGetLease(redis)).queryOpenCreateRecovery(
      'order-1',
    );
    expect(getCalls).toBe(0);
    expect(result.queried).toBe(false);
    expect(store.creates).toHaveLength(0);
  });

  it('6. Redis error on inspect refuses close-claim', async () => {
    const redis = new MemoryEsimLeaseRedis();
    redis.failGet = true;
    const { query, esimAdmin } = closeHarness({ lease: new EsimGetLease(redis) });
    await expect(esimAdmin.closeSentQueryClaim(closeInput)).rejects.toThrow(
      ESIM_QUERY_CLAIM_LEASE_UNKNOWN,
    );
    expect(query.outcome).toBe(EsimAttemptOutcome.SENT);
  });

  it('7-8. release is compare-token and an old owner cannot delete a new lease', async () => {
    const redis = new MemoryEsimLeaseRedis();
    const evalSpy = jest.spyOn(redis, 'eval');
    const lease = new EsimGetLease(redis);
    const first = await lease.acquire('attempt-1', {
      orderId: 'order-1',
      orderItemId: 'item-1',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    redis.store.delete(esimGetLeaseKey('attempt-1'));
    const held = await lease.acquire('attempt-1', {
      orderId: 'order-1',
      orderItemId: 'item-1',
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    await expect(lease.release('attempt-1', first.payload)).resolves.toBe('mismatch');
    expect(evalSpy).toHaveBeenCalled();
    expect(await lease.inspect('attempt-1')).toBe('PRESENT');
    await expect(lease.release('attempt-1', held.payload)).resolves.toBe('released');
  });

  it('9. lease stays held until GET settles', async () => {
    const hang = hangingGet();
    const store = new MemoryStore();
    seedOpenRef(store);
    const pending = service(store, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    await hang.entered.promise;
    expect(await hang.lease.inspect('attempt-1')).toBe('PRESENT');
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pending;
    expect(await hang.lease.inspect('attempt-1')).toBe('ABSENT');
  });

  it('10. a caller timeout does not release a still-running HTTP GET', async () => {
    const hang = hangingGet();
    const store = new MemoryStore();
    seedOpenRef(store);
    const pending = service(store, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    await hang.entered.promise;
    const raced = await Promise.race([
      pending,
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
    ]);
    expect(raced).toBe('timeout');
    expect(await hang.lease.inspect('attempt-1')).toBe('PRESENT');
    expect(hang.getCalls()).toBe(1);
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pending;
    expect(await hang.lease.inspect('attempt-1')).toBe('ABSENT');
  });

  it('11. successful persist keeps COMPLETED and does not lower it', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    await store.markUnconfirmed('attempt-1', 'item-1');
    expect(store.status).toBe(FulfillmentStatus.COMPLETED);
    expect(store.profiles.has('item-1')).toBe(true);
  });

  it('12. persist error / P2002 does not overwrite a stored profile or COMPLETED', async () => {
    const failed = new MemoryStore();
    seedOpenRef(failed);
    failed.failSave = true;
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const failedResult = await service(failed, port).queryOpenCreateRecovery('order-1');
    expect(failedResult.fulfillmentStatus).not.toBe(FulfillmentStatus.COMPLETED);
    expect(failed.profiles.has('item-1')).toBe(false);

    const raced = new MemoryStore();
    seedOpenRef(raced);
    raced.saveProfile = async (input) => {
      raced.profiles.add(input.orderItemId);
      raced.status = FulfillmentStatus.COMPLETED;
      throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      });
    };
    const racedResult = await service(raced, port).queryOpenCreateRecovery('order-1');
    expect(racedResult.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(raced.profiles.has('item-1')).toBe(true);
    await raced.markUnconfirmed('attempt-1', 'item-1');
    expect(raced.status).toBe(FulfillmentStatus.COMPLETED);
  });

  it('13. QUERY claim conflict does not call GET', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.queryLocked = true;
    let getCalls = 0;
    const port = livePort({
      getInstallDetails: async () => {
        getCalls += 1;
        return { orderReference: '104159', installSecret: FIXTURE };
      },
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.queried).toBe(false);
    expect(getCalls).toBe(0);
    expect(store.closedQueryAttempts).toHaveLength(0);
  });

  it('14. acquire failure after this request created the claim closes only that claim', async () => {
    const redis = new MemoryEsimLeaseRedis();
    redis.failSet = true;
    const own = new MemoryStore();
    seedOpenRef(own);
    let getCalls = 0;
    const port = livePort({
      getInstallDetails: async () => {
        getCalls += 1;
        return { orderReference: '104159', installSecret: FIXTURE };
      },
    });
    await service(own, port, new EsimGetLease(redis)).queryOpenCreateRecovery('order-1');
    expect(getCalls).toBe(0);
    expect(own.closedQueryAttempts).toEqual(['query-1']);
    expect(own.queryLocked).toBe(false);

    const other = new MemoryStore();
    seedOpenRef(other);
    other.queryLocked = true;
    other.queryClaims = 4;
    await service(other, port, new EsimGetLease(redis)).queryOpenCreateRecovery('order-1');
    expect(other.closedQueryAttempts).toHaveLength(0);
    expect(other.queryLocked).toBe(true);
    expect(other.queryClaims).toBe(4);
  });

  it('15. lease conflict or recovery does not open a second CREATE', async () => {
    const hang = hangingGet();
    const store = new MemoryStore();
    seedOpenRef(store);
    const pending = service(store, hang.port, hang.lease).queryOpenCreateRecovery('order-1');
    await hang.entered.promise;
    const again = await service(store, hang.port, hang.lease).fulfill('order-1');
    expect(store.creates).toHaveLength(0);
    expect(hang.port.createOrder).not.toHaveBeenCalled();
    expect(again.created).toBe(false);
    hang.hang.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await pending;

    const live = new MemoryStore();
    const entered = deferred<void>();
    const hangCreate = deferred<{ orderReference: string; installSecret?: string }>();
    const livePortHang = livePort({
      createOrder: async () => ({ orderReference: '104159' }),
      getInstallDetails: async () => {
        entered.resolve();
        return hangCreate.promise as Promise<{ orderReference: string; installSecret: string }>;
      },
    });
    const lease = new EsimGetLease(new MemoryEsimLeaseRedis());
    const first = service(live, livePortHang, lease).fulfill('order-1');
    await entered.promise;
    const second = await service(live, livePortHang, lease).fulfill('order-1');
    expect(live.creates).toEqual(['attempt-1']);
    expect(livePortHang.createOrder).toHaveBeenCalledTimes(1);
    expect(second.created).toBe(false);
    hangCreate.resolve({ orderReference: '104159', installSecret: FIXTURE });
    await first;
  });

  it('ABSENT lease is not enough to close a QUERY claim', async () => {
    const { query, esimAdmin } = closeHarness({
      lease: new EsimGetLease(new MemoryEsimLeaseRedis()),
    });
    await expect(esimAdmin.closeSentQueryClaim(closeInput)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(esimAdmin.closeSentQueryClaim(closeInput)).rejects.toThrow(
      ESIM_QUERY_CLAIM_ABSENT_NOT_PROOF,
    );
    expect(query.outcome).toBe(EsimAttemptOutcome.SENT);
    const missing = closeHarness({ leaseMissing: true });
    await expect(missing.esimAdmin.closeSentQueryClaim(closeInput)).rejects.toThrow(
      ESIM_QUERY_CLAIM_LEASE_UNKNOWN,
    );
  });
});
