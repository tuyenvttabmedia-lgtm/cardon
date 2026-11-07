import { FulfillmentStatus, OrderEventType, ProductVariantType } from '@prisma/client';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import {
  isPersistedAdminTest,
  persistAdminTestFulfillmentSkip,
  readAdminTestFulfillmentSkip,
} from './esim-admin-test.rules';
import { FulfillmentDispatchService } from '../provider/services/fulfillment-dispatch.service';

describe('persisted admin test fulfillment skip', () => {
  it('accepts only a stored boolean adminTest flag', () => {
    expect(isPersistedAdminTest({ adminTest: true })).toBe(true);
    expect(isPersistedAdminTest({ adminTest: 'true' })).toBe(false);
    expect(isPersistedAdminTest({ adminTest: 1 })).toBe(false);
    expect(isPersistedAdminTest({ deviceInfo: { adminTest: true } })).toBe(false);
    expect(isPersistedAdminTest({})).toBe(false);
    expect(isPersistedAdminTest(null)).toBe(false);
    expect(isPersistedAdminTest([])).toBe(false);
  });

  it('marks the order once and does not open a provider attempt', async () => {
    const updates: unknown[] = [];
    const events: unknown[] = [];
    let trace: Record<string, unknown> = { adminTest: true, customerId: 'admin-1' };
    const db = {
      order: {
        findUnique: jest.fn(async () => ({
          clientTrace: trace,
          fulfillmentStatus: FulfillmentStatus.PENDING,
        })),
        update: jest.fn(async ({ data }: { data: { clientTrace: Record<string, unknown> } }) => {
          updates.push(data);
          trace = data.clientTrace;
        }),
      },
      orderEvent: {
        create: jest.fn(async ({ data }: { data: unknown }) => {
          events.push(data);
        }),
      },
    };
    await expect(persistAdminTestFulfillmentSkip(db as never, 'order-1')).resolves.toBe(true);
    await expect(persistAdminTestFulfillmentSkip(db as never, 'order-1')).resolves.toBe(true);
    expect(updates).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(readAdminTestFulfillmentSkip(trace)).toBe(true);
    expect(events[0]).toMatchObject({
      eventType: OrderEventType.ORDER_NEED_SUPPORT,
      metadata: { adminTestFulfillment: 'SKIPPED', reason: 'ADMIN_TEST' },
    });
  });

  it('does not mark a customer order', async () => {
    const db = {
      order: {
        findUnique: jest.fn(async () => ({
          clientTrace: { customerId: 'user-1' },
          fulfillmentStatus: FulfillmentStatus.PENDING,
        })),
        update: jest.fn(),
      },
      orderEvent: { create: jest.fn() },
    };
    await expect(persistAdminTestFulfillmentSkip(db as never, 'order-2')).resolves.toBe(false);
    expect(db.order.update).not.toHaveBeenCalled();
    expect(db.orderEvent.create).not.toHaveBeenCalled();
  });
});

describe('admin test never reaches an eSIM provider', () => {
  function fulfillment(skip: boolean) {
    const provider = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      getInstallDetails: jest.fn(),
    };
    const repository = {
      skipAdminTestFulfillment: jest.fn(async () => skip),
      findQuoteByOrderId: jest.fn(async () => {
        throw new Error('quote should not be loaded');
      }),
    };
    const service = new EsimFulfillmentService(
      repository as never,
      { create: jest.fn() } as never,
      provider as never,
      {} as never,
    );
    return { service, provider, repository };
  }

  it('stops fulfill, query, recovery, and install lookup before any provider call', async () => {
    const { service, provider, repository } = fulfillment(true);
    for (const run of [
      () => service.fulfill('order-1'),
      () => service.query('order-1'),
      () => service.queryOpenCreateRecovery('order-1'),
      () => service.recoverExistingInstall('order-1'),
    ]) {
      const result = await run();
      expect(result).toMatchObject({
        orderId: 'order-1',
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        created: false,
      });
    }
    expect(repository.findQuoteByOrderId).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(provider.getOrder).not.toHaveBeenCalled();
    expect(provider.getInstallDetails).not.toHaveBeenCalled();
  });

  it('does not enqueue an admin test order and still enqueues a customer eSIM order', async () => {
    const esimQueue = { enqueueFulfillment: jest.fn(async () => 'esim-job') };
    const orders = new Map<string, { clientTrace: Record<string, unknown> }>([
      ['admin-order', { clientTrace: { adminTest: true } }],
      ['customer-order', { clientTrace: { customerId: 'user-1' } }],
    ]);
    const repository = {
      findOrderForFulfillment: jest.fn(async (orderId: string) => ({
        id: orderId,
        clientTrace: orders.get(orderId)?.clientTrace ?? {},
        orderItems: [{ variant: { type: ProductVariantType.ESIM } }],
      })),
      markAdminTestFulfillmentSkipped: jest.fn(async () => true),
    };
    const dispatch = new FulfillmentDispatchService(
      repository as never,
      { enqueueFulfillment: jest.fn() } as never,
      { enqueueFulfillment: jest.fn() } as never,
      {} as never,
      {} as never,
      esimQueue as never,
    );
    await expect(dispatch.dispatchOrderFulfillment('admin-order')).resolves.toEqual([]);
    expect(repository.markAdminTestFulfillmentSkipped).toHaveBeenCalledWith('admin-order');
    expect(esimQueue.enqueueFulfillment).not.toHaveBeenCalled();
    await expect(dispatch.dispatchOrderFulfillment('customer-order')).resolves.toEqual(['esim-job']);
    expect(esimQueue.enqueueFulfillment).toHaveBeenCalledWith('customer-order');
  });
});
