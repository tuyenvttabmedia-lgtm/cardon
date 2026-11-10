import { FulfillmentStatus } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { EsimAdminService } from './esim-admin.service';
import { FIXTURE, livePort, MemoryStore, service } from './esim-recover-install.spec';

const root = join(__dirname, '../../..');

describe('LPA-16K13 first-CREATE claim', () => {
  it('1. PENDING without profile/guard/ref claims once and creates once', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const result = await fulfillment.fulfill('order-1');
    expect(result.created).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(store.status === FulfillmentStatus.COMPLETED || store.profiles.has('item-1')).toBe(true);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
  });

  it('2. existing PROCESSING is not this worker claim and does not CREATE', async () => {
    const store = new MemoryStore();
    store.status = FulfillmentStatus.PROCESSING;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(false);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.PROCESSING);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
    expect(store.open.size).toBe(0);
  });

  it.each([
    ['3. NEED_MANUAL_REVIEW', FulfillmentStatus.NEED_MANUAL_REVIEW],
    ['4. COMPLETED', FulfillmentStatus.COMPLETED],
    ['5. FAILED', FulfillmentStatus.FAILED],
  ] as const)('%s does not CREATE', async (_name, status) => {
    const store = new MemoryStore();
    store.status = status;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(false);
    expect(result.fulfillmentStatus).toBe(status);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('6. WAITING_ADMIN_RETRY without open guard may CREATE once (definite no-CREATE retry)', async () => {
    const store = new MemoryStore();
    store.status = FulfillmentStatus.WAITING_ADMIN_RETRY;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(true);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
  });

  it('7. late job after unclaimed recover does not CREATE', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    await new EsimAdminService({} as never, store as never, fulfillment).recoverInstall('order-1');
    const worker = await fulfillment.fulfill('order-1');
    expect(worker.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('8. two workers: at most one claim and one first CREATE', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const fulfillment = service(store, port);
    const [left, right] = await Promise.all([fulfillment.fulfill('order-1'), fulfillment.fulfill('order-1')]);
    const created = [left, right].filter((row) => row.created);
    expect(created).toHaveLength(1);
    expect(port.createOrder).toHaveBeenCalledTimes(1);
    expect(store.creates).toHaveLength(1);
  });

  it('9. stored reference recovers by GET and never POSTs', async () => {
    const store = new MemoryStore();
    store.open.add('item-1');
    store.references.set('item-1', { attemptId: 'attempt-1', providerReference: '104159' });
    store.status = FulfillmentStatus.NEED_MANUAL_REVIEW;
    const port = livePort({
      createOrder: async () => ({ orderReference: 'should-not-create' }),
      getInstallDetails: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(false);
    expect(result.queried).toBe(true);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(port.getInstallDetails).toHaveBeenCalled();
  });

  it('10. existing profile does not CREATE', async () => {
    const store = new MemoryStore();
    store.profiles.add('item-1');
    store.status = FulfillmentStatus.COMPLETED;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(false);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(port.createOrder).not.toHaveBeenCalled();
  });

  it('11. admin recover stays QUERY-only', async () => {
    const store = new MemoryStore();
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await new EsimAdminService({} as never, store as never, service(store, port)).recoverInstall(
      'order-1',
    );
    expect(result.created).toBe(false);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
  });

  it('14. claim DB error is fail-closed and does not CREATE', async () => {
    const store = new MemoryStore();
    store.failClaim = true;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    await expect(service(store, port).fulfill('order-1')).rejects.toThrow('claim write failed');
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.creates).toHaveLength(0);
    expect(store.open.size).toBe(0);
  });

  it('15. status becomes review before the last check and does not CREATE', async () => {
    const store = new MemoryStore();
    store.flipToReviewAfterReads = 2;
    const port = livePort({
      createOrder: async () => ({ orderReference: '104159', installSecret: FIXTURE }),
    });
    const result = await service(store, port).fulfill('order-1');
    expect(result.created).toBe(false);
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.NEED_MANUAL_REVIEW);
    expect(port.createOrder).not.toHaveBeenCalled();
    expect(store.open.has('item-1')).toBe(true);
    expect(store.references.get('item-1')?.providerReference ?? null).toBeNull();
  });

  it('16. HTTP CREATE is not wrapped in a DB transaction', () => {
    const fulfill = readFileSync(join(root, 'src/modules/esim/esim-fulfillment.service.ts'), 'utf8');
    const live = fulfill.slice(fulfill.indexOf('private async fulfillLive'), fulfill.indexOf('private async recoverLiveInstall'));
    expect(live).toContain('this.provider.createOrder');
    expect(live).toContain('getOrderFulfillmentStatus');
    expect(live.indexOf('getOrderFulfillmentStatus')).toBeLessThan(live.indexOf('this.provider.createOrder'));
    expect(live).not.toContain('$transaction');
    expect(live).not.toContain('paymentStatus');
  });
});
