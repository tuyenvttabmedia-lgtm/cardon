import { FulfillmentStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EsimAdminService } from './esim-admin.service';
import { EsimGetLease, MemoryEsimLeaseRedis } from './esim-get-lease';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { FIXTURE, livePort, MemoryStore, service } from './esim-recover-install.spec';

const root = join(__dirname, '../../..');

function seedOpenRef(store: MemoryStore, ref = '104159') {
  store.status = FulfillmentStatus.PROCESSING;
  store.open.add('item-1');
  store.references.set('item-1', { attemptId: 'attempt-1', providerReference: ref });
}

describe('LPA-16K17-A+C query-open recovery', () => {
  it('source queryOpenCreateRecovery never calls createOrder or fulfill', () => {
    const fulfill = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8');
    const cron = readFileSync(join(root, 'src/modules/esim/esim-query-open.cron.ts'), 'utf8');
    const start = fulfill.indexOf('async queryOpenCreateRecovery');
    const end = fulfill.indexOf('private async resumeExistingCreate');
    const body = fulfill.slice(start, end === -1 ? fulfill.length : end);
    expect(cron).toContain('enqueueQueryOpen');
    expect(cron).not.toContain('createOrder');
    expect(cron).not.toContain('enqueueFulfillment');
    expect(body).toContain('insertQuery');
    expect(body).toContain('readInstallFromProvider');
    expect(body).toContain('storeInstallSecret');
    expect(body).not.toContain('createOrder');
    expect(body).not.toContain('.fulfill(');
    expect(body).not.toContain('/v2/orders');
    expect(body).not.toMatch(/LPA:1\$|qrcode=|matching_id=/i);
  });

  it('listQueryOpenRecoveryOrderIds filters QUERY locks in SQL before LIMIT', () => {
    const repo = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.repository.ts'), 'utf8');
    const start = repo.indexOf('async listQueryOpenRecoveryOrderIds');
    const end = repo.indexOf('async insertOpenCreate');
    const body = repo.slice(start, end === -1 ? repo.length : end);
    expect(body.indexOf('NOT EXISTS')).toBeGreaterThan(-1);
    expect(body.indexOf('NOT EXISTS')).toBeLessThan(body.indexOf('LIMIT'));
    expect(body).toContain('$queryRaw');
    expect(body).not.toMatch(/\bUPDATE\b|\bDELETE\b/);
    expect(body).not.toContain('closeQueryAttempt');
    expect(body).not.toContain('closeSentQueryClaim');
    expect(body).not.toContain('createOrder');
    expect(body).not.toContain('/v2/orders');
  });

  it('1. valid ref + guard + PROCESSING queries GET only', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(0);
    expect(store.profiles.has('item-1')).toBe(true);
    expect(store.open.has('item-1')).toBe(false);
  });

  it('2. missing provider reference does not call provider or CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store, '');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: null });
    const port = livePort({});
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(result.hasReference).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
  });

  it('3. missing open guard does not call provider or CREATE', async () => {
    const store = new MemoryStore();
    store.status = FulfillmentStatus.PROCESSING;
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    const port = livePort({});
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
  });

  it('4. guard mismatch does not call provider or CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.openGuards.set('item-1', 'other-item');
    const port = livePort({});
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
  });

  it('5. NEED_MANUAL_REVIEW does not call provider or CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    const port = livePort({});
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
  });

  it('6. COMPLETED with profile is a no-op', async () => {
    const store = new MemoryStore();
    store.status = FulfillmentStatus.COMPLETED;
    store.profiles.add('item-1');
    const port = livePort({});
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.queried).toBe(false);
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
  });

  it('7. GET error keeps guard and reference and does not CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => {
        throw new Error('GET timeout');
      },
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.PROCESSING);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('8. provider not ready keeps guard and does not CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159' }),
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.PROCESSING);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.profiles.has('item-1')).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('9. persist failure keeps guard and does not CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    store.failSave = true;
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).queryOpenCreateRecovery('order-1');
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(store.open.has('item-1')).toBe(true);
    expect(store.profiles.has('item-1')).toBe(false);
    expect(store.references.get('item-1')?.providerReference).toBe('104159');
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('10. concurrent recoveries do not double-write or drop the guard incorrectly', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    let inflight = 0;
    const port = livePort({
      getInstallDetails: async () => {
        inflight += 1;
        expect(inflight).toBe(1);
        return { orderReference: '104159', installSecret: FIXTURE };
      },
    });
    const fulfillment = service(store, port);
    const [first, second] = await Promise.all([
      fulfillment.queryOpenCreateRecovery('order-1'),
      fulfillment.queryOpenCreateRecovery('order-1'),
    ]);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalledTimes(1);
    expect([first.queried, second.queried].filter(Boolean)).toHaveLength(1);
    expect(store.profiles.has('item-1')).toBe(true);
    expect(store.open.has('item-1')).toBe(false);
    expect(store.queryClaims).toBe(1);
  });

  it('11. persist happens before the CREATE guard is released', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const order = ['none'];
    const originalSave = store.saveProfile.bind(store);
    store.saveProfile = async (input: { orderItemId: string }) => {
      expect(store.open.has('item-1')).toBe(true);
      order.push('save');
      await originalSave(input);
      order.push('released');
    };
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    await service(store, port).queryOpenCreateRecovery('order-1');
    expect(order).toEqual(['none', 'save', 'released']);
    expect(store.open.has('item-1')).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('12. recoverExistingInstall still does not call fulfill or CREATE', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfill = new EsimFulfillmentService(
      store as never,
      { create: jest.fn() } as never,
      port as never,
      { encrypt: (value: string) => `enc:${value}` } as never,
      undefined,
      undefined,
      new EsimGetLease(new MemoryEsimLeaseRedis()),
    );
    const fulfillSpy = jest.spyOn(fulfill, 'fulfill');
    const admin = new EsimAdminService({} as never, store as never, fulfill);
    await admin.recoverInstall('order-1');
    expect(fulfillSpy).not.toHaveBeenCalled();
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('13. crash-window PROCESSING without ref stays fail-closed', async () => {
    const store = new MemoryStore();
    store.status = FulfillmentStatus.PROCESSING;
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: null });
    const port = livePort({
      createOrder: async () => ({ orderReference: 'should-not', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const fulfillResult = await fulfillment.fulfill('order-1');
    const queryResult = await fulfillment.queryOpenCreateRecovery('order-1');
    expect(fulfillResult.created).toBe(false);
    expect(queryResult.created).toBe(false);
    expect(queryResult.queried).toBe(false);
    expect(queryResult.hasReference).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
    expect(store.open.has('item-1')).toBe(true);
  });

  it('14. recovery logs and events do not include fixture secrets', async () => {
    const store = new MemoryStore();
    seedOpenRef(store);
    const port = livePort({
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const logs: string[] = [];
    jest.spyOn(fulfillment['logger'], 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    await fulfillment.queryOpenCreateRecovery('order-1');
    const combined = [...logs, ...store.events].join('\n');
    expect(combined).not.toContain(FIXTURE);
    expect(combined).not.toMatch(/LPA:1\$|enc:|qrcode=|matching_id=/i);
    expect(port.createOrder).not.toHaveBeenCalled();
  });
});
