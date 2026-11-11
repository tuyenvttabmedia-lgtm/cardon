import { NotFoundException } from '@nestjs/common';
import { EsimAttemptOutcome, FulfillmentStatus } from '@prisma/client';
import { FulfillmentDispatchService } from '../provider/services/fulfillment-dispatch.service';
import { EsimFulfillmentService } from './esim-fulfillment.service';
import { EsimMockAdapter, EsimOutcomeUnconfirmedError } from './esim-mock.adapter';
import { EsimOrderService } from './esim-order.service';
import { EsimWorker } from './esim.worker';
import { ESIM_QUEUE_JOB } from './esim.constants';

/**
 * B3.55 lifecycle gaps. Existing phase-a tests already cover the happy mock
 * profile, live QUERY, and mixed-order dispatch. These cases only lock
 * branches that those suites do not assert.
 */
describe('B3.55 eSIM mock lifecycle', () => {
  function orderHarness(config: Record<string, boolean | string>, settingsEnabled: boolean) {
    const transaction = jest.fn();
    const findActiveById = jest.fn();
    const listForVariant = jest.fn();
    const service = new EsimOrderService(
      { $transaction: transaction } as never,
      {
        createFinancialTransaction: jest.fn(),
        createWithTransaction: jest.fn(),
        createOrderItem: jest.fn(),
      } as never,
      { findActiveById } as never,
      { getCustomerPrice: jest.fn() } as never,
      { listForVariant } as never,
      {
        resolveSystemConfig: () => ({ customerEsimEnabled: settingsEnabled }),
        getPublicPaymentMethods: () => [],
        resolvePaymentMethod: () => {
          throw new Error('payment should not be resolved');
        },
        resolveEsimPaymentMethod: () => {
          throw new Error('payment should not be resolved');
        },
        listEsimMegapayMethodCodes: () => [],
      } as never,
      { get: (key: string) => config[key] } as never,
    );
    return { service, transaction, findActiveById, listForVariant };
  }

  const customer = { id: 'user-1', email: 'a@test.invalid', role: 'CUSTOMER' };

  it('rejects a disabled or live sale before the order transaction', async () => {
    const cases = [
      {
        config: { 'esim.enabled': false, 'esim.providerMode': 'mock', 'esim.liveArm': true },
        settingsEnabled: false,
        message: 'eSIM sales are disabled',
      },
      {
        config: { 'esim.enabled': true, 'esim.providerMode': 'mock', 'esim.liveArm': false },
        settingsEnabled: false,
        message: 'eSIM sales are disabled',
      },
      {
        config: { 'esim.enabled': true, 'esim.providerMode': 'live', 'esim.liveArm': false },
        settingsEnabled: true,
        message: 'eSIM live provider is disabled',
      },
    ];

    for (const entry of cases) {
      const { service, transaction, findActiveById, listForVariant } = orderHarness(
        entry.config,
        entry.settingsEnabled,
      );
      await expect(
        service.create({ items: [{ variantId: 'variant-1', quantity: 1 }] } as never, customer as never),
      ).rejects.toThrow(entry.message);
      expect(transaction).not.toHaveBeenCalled();
      expect(findActiveById).not.toHaveBeenCalled();
      expect(listForVariant).not.toHaveBeenCalled();
    }
  });

  it('rejects a non-eSIM variant and a quantity other than 1 before the order transaction', async () => {
    const shape = orderHarness(
      { 'esim.enabled': true, 'esim.providerMode': 'mock', 'esim.liveArm': false },
      true,
    );
    await expect(
      shape.service.create(
        { items: [{ variantId: 'variant-1', quantity: 2 }] } as never,
        customer as never,
      ),
    ).rejects.toThrow('An eSIM order contains one item with quantity 1');
    expect(shape.transaction).not.toHaveBeenCalled();
    expect(shape.findActiveById).not.toHaveBeenCalled();

    const wrongType = orderHarness(
      { 'esim.enabled': true, 'esim.providerMode': 'mock', 'esim.liveArm': false },
      true,
    );
    wrongType.findActiveById.mockResolvedValue({ id: 'variant-1', type: 'CARD' });
    await expect(
      wrongType.service.create(
        { items: [{ variantId: 'variant-1', quantity: 1 }] } as never,
        customer as never,
      ),
    ).rejects.toThrow('Variant is not an active eSIM');
    expect(wrongType.transaction).not.toHaveBeenCalled();
    expect(wrongType.listForVariant).not.toHaveBeenCalled();
  });

  it('does not enqueue provider_queue or topup_queue when an eSIM-only retry is refused', async () => {
    const esim = { enqueueFulfillment: jest.fn() };
    const provider = { enqueueFulfillment: jest.fn() };
    const topup = { enqueueFulfillment: jest.fn() };
    const providerService = { retryFulfillment: jest.fn(), retryFulfillmentWithOptions: jest.fn() };
    const topupService = { retryFulfillment: jest.fn() };
    const service = new FulfillmentDispatchService(
      {
        findOrderForFulfillment: async () => ({
          orderItems: [{ variant: { type: 'ESIM' } }],
        }),
      } as never,
      provider as never,
      topup as never,
      providerService as never,
      topupService as never,
      esim as never,
    );

    await expect(service.retryOrderFulfillment('order-1')).rejects.toThrow(
      'eSIM orders are not retried through the card provider',
    );
    expect(esim.enqueueFulfillment).not.toHaveBeenCalled();
    expect(provider.enqueueFulfillment).not.toHaveBeenCalled();
    expect(topup.enqueueFulfillment).not.toHaveBeenCalled();
    expect(providerService.retryFulfillment).not.toHaveBeenCalled();
    expect(providerService.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(topupService.retryFulfillment).not.toHaveBeenCalled();
  });

  it('stops a missing quote before CREATE, QUERY, or a profile write', async () => {
    const mock = new EsimMockAdapter();
    const provider = { createOrder: jest.fn(), getOrder: jest.fn() };
    const saveProfile = jest.fn();
    const service = new EsimFulfillmentService(
      {
        findQuoteByOrderId: async () => null,
        insertOpenCreate: jest.fn(),
        saveProfile,
      } as never,
      mock,
      provider as never,
      { encrypt: jest.fn() } as never,
    );

    await expect(service.fulfill('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.query('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(mock.createCount).toBe(0);
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(provider.getOrder).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it('ignores a queue job that is not the fulfill job', async () => {
    const fulfill = jest.fn();
    const query = jest.fn();
    await new EsimWorker({ fulfill, query } as never).process({
      name: 'other',
      id: 'esim-fulfill-order-1',
      data: { orderId: 'order-1' },
    } as never);
    expect(fulfill).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed mock CREATE in manual review and does not CREATE again', async () => {
    const open: {
      current: {
        attemptId: string;
        outcome: EsimAttemptOutcome;
        providerReference: string | null;
      } | null;
    } = { current: null };
    let claimed = false;
    const insertOpenCreate = jest.fn(async () => {
      open.current = {
        attemptId: 'attempt-1',
        outcome: EsimAttemptOutcome.SENT,
        providerReference: null,
      };
      return { attemptId: 'attempt-1', requestId: 'esim-item-1-attempt-1' };
    });
    const markUnconfirmed = jest.fn(async () => {
      if (open.current) open.current.outcome = EsimAttemptOutcome.UNCONFIRMED;
    });
    const saveProfile = jest.fn();
    const markNeedsReview = jest.fn();
    const mock = new EsimMockAdapter();
    jest.spyOn(mock, 'create').mockRejectedValue(new EsimOutcomeUnconfirmedError());
    const provider = { createOrder: jest.fn(), getOrder: jest.fn() };
    const service = new EsimFulfillmentService(
      {
        findQuoteByOrderId: async () => ({
          quoteId: 'quote-1',
          orderItemId: 'item-1',
          providerId: 'provider-1',
          providerProductCode: 'MOCK-A',
          providerMode: 'MOCK',
        }),
        getOrderFulfillmentStatus: async () =>
          claimed ? FulfillmentStatus.PROCESSING : FulfillmentStatus.PENDING,
        claimFirstCreate: jest.fn(async () => {
          if (open.current || claimed) return false;
          claimed = true;
          return true;
        }),
        hasProfile: async () => false,
        findOpenCreate: async () => open.current,
        insertOpenCreate,
        markUnconfirmed,
        saveProfile,
        markNeedsReview,
        notifyDelivered: jest.fn(),
        recordOrderEvent: jest.fn(),
      } as never,
      mock,
      provider as never,
      { encrypt: jest.fn() } as never,
    );
    const seen: FulfillmentStatus[] = [];
    const fulfill = service.fulfill.bind(service);
    const query = service.query.bind(service);
    jest.spyOn(service, 'fulfill').mockImplementation(async (orderId, options) => {
      const result = await fulfill(orderId, options);
      seen.push(result.fulfillmentStatus);
      return result;
    });
    jest.spyOn(service, 'query').mockImplementation((orderId) => query(orderId));
    const worker = new EsimWorker(service);
    const job = {
      name: ESIM_QUEUE_JOB.FULFILL,
      id: 'esim-fulfill-order-1',
      data: { orderId: 'order-1' },
    } as never;

    await worker.process(job);
    await worker.process(job);

    expect(seen).toEqual([
      FulfillmentStatus.NEED_MANUAL_REVIEW,
      FulfillmentStatus.NEED_MANUAL_REVIEW,
    ]);
    expect(insertOpenCreate).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(markUnconfirmed).toHaveBeenCalledTimes(1);
    expect(markNeedsReview).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(provider.createOrder).not.toHaveBeenCalled();
    expect(provider.getOrder).not.toHaveBeenCalled();
    expect(open.current?.outcome).toBe(EsimAttemptOutcome.UNCONFIRMED);
  });
});
