import { BadRequestException } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { EsimAdminService } from '../esim/esim-admin.service';
import { FulfillmentDispatchService } from '../provider/services/fulfillment-dispatch.service';
import { ProviderService } from '../provider/services/provider.service';
import { AdminOrderService } from './services/admin-order.service';

/**
 * B3.57C. An eSIM-only retry is rejected before provider options.
 * CARD, TOPUP, DATA, mixed orders, and dispatch queue mapping stay as they were.
 */
describe('B3.57A admin recovery boundaries', () => {
  function order(type: 'ESIM' | 'CARD' | 'TOPUP' | 'DATA' | 'MIXED') {
    if (type === 'MIXED') {
      return {
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        clientTrace: {},
        orderItems: [
          { id: 'item-esim', variantId: 'variant-esim', quantity: 1, variant: { type: 'ESIM' } },
          { id: 'item-card', variantId: 'variant-card', quantity: 1, variant: { type: 'CARD' } },
        ],
      };
    }
    return {
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      clientTrace: {},
      orderItems: [
        { id: 'item-1', variantId: `variant-${type}`, quantity: 1, variant: { type } },
      ],
    };
  }

  function effects() {
    return {
      countByOrderItemId: jest.fn(),
      claimFulfillmentProcessing: jest.fn(),
      updateFulfillmentStatus: jest.fn(),
      findLatestRecoverable: jest.fn(),
      listForVariant: jest.fn(),
      notifyAdminRetryRequired: jest.fn(),
      enqueueFulfillment: jest.fn(),
      enqueueRetry: jest.fn(),
    };
  }

  function realProvider(findOrder: jest.Mock, fx: ReturnType<typeof effects>) {
    const service = new ProviderService(
      {} as never,
      { listForVariant: fx.listForVariant } as never,
      {} as never,
      {
        findOrderForFulfillment: findOrder,
        claimFulfillmentProcessing: fx.claimFulfillmentProcessing,
        updateFulfillmentStatus: fx.updateFulfillmentStatus,
      } as never,
      { findLatestRecoverable: fx.findLatestRecoverable } as never,
      { countByOrderItemId: fx.countByOrderItemId } as never,
      {} as never,
      {} as never,
      { notifyAdminRetryRequired: fx.notifyAdminRetryRequired } as never,
      {
        enqueueFulfillment: fx.enqueueFulfillment,
        enqueueRetry: fx.enqueueRetry,
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return service;
  }

  function dispatchFor(
    loaded: ReturnType<typeof order>,
    provider: object,
    topupRetry = jest.fn(),
  ) {
    const calls: string[] = [];
    const findOrder = jest.fn(async () => {
      calls.push('findOrder');
      return loaded;
    });
    const queues = {
      esim: jest.fn(),
      provider: jest.fn(),
      topup: jest.fn(),
    };
    const topupService = { retryFulfillment: topupRetry };
    const dispatch = new FulfillmentDispatchService(
      { findOrderForFulfillment: findOrder } as never,
      { enqueueFulfillment: queues.provider } as never,
      { enqueueFulfillment: queues.topup } as never,
      provider as never,
      topupService as never,
      { enqueueFulfillment: queues.esim } as never,
    );
    return { dispatch, calls, findOrder, queues, topupService };
  }

  function expectNoQueues(queues: { esim: jest.Mock; provider: jest.Mock; topup: jest.Mock }) {
    expect(queues.esim).not.toHaveBeenCalled();
    expect(queues.provider).not.toHaveBeenCalled();
    expect(queues.topup).not.toHaveBeenCalled();
  }

  function expectNoProviderWrites(fx: ReturnType<typeof effects>) {
    expect(fx.countByOrderItemId).not.toHaveBeenCalled();
    expect(fx.claimFulfillmentProcessing).not.toHaveBeenCalled();
    expect(fx.updateFulfillmentStatus).not.toHaveBeenCalled();
    expect(fx.findLatestRecoverable).not.toHaveBeenCalled();
    expect(fx.listForVariant).not.toHaveBeenCalled();
    expect(fx.notifyAdminRetryRequired).not.toHaveBeenCalled();
    expect(fx.enqueueFulfillment).not.toHaveBeenCalled();
    expect(fx.enqueueRetry).not.toHaveBeenCalled();
  }

  it('rejects a plain eSIM retry before the card provider service', async () => {
    const fx = effects();
    const findOrder = jest.fn();
    const provider = realProvider(findOrder, fx);
    const retry = jest.spyOn(provider, 'retryFulfillment');
    const retryWithOptions = jest.spyOn(provider, 'retryFulfillmentWithOptions');
    const { dispatch, calls, queues } = dispatchFor(order('ESIM'), provider);

    await expect(dispatch.retryOrderFulfillment('order-1')).rejects.toThrow(
      'eSIM orders are not retried through the card provider',
    );
    expect(calls).toEqual(['findOrder']);
    expect(retry).not.toHaveBeenCalled();
    expect(retryWithOptions).not.toHaveBeenCalled();
    expectNoQueues(queues);
    expectNoProviderWrites(fx);
  });

  it.each([
    [{ forceProviderId: 'provider-9' }],
    [{ skipProviderIds: ['provider-1'] }],
  ])(
    'rejects an eSIM-only retry with %j before retryFulfillmentWithOptions',
    async (options) => {
      const fx = effects();
      const calls: string[] = [];
      const loaded = order('ESIM');
      const findOrder = jest.fn(async () => {
        calls.push('findOrder');
        return loaded;
      });
      const provider = realProvider(findOrder, fx);
      const plainRetry = jest.spyOn(provider, 'retryFulfillment');
      const retryWithOptions = jest.spyOn(provider, 'retryFulfillmentWithOptions');
      const queues = { esim: jest.fn(), provider: jest.fn(), topup: jest.fn() };
      const topupRetry = jest.fn();
      const dispatch = new FulfillmentDispatchService(
        { findOrderForFulfillment: findOrder } as never,
        { enqueueFulfillment: queues.provider } as never,
        { enqueueFulfillment: queues.topup } as never,
        provider,
        { retryFulfillment: topupRetry } as never,
        { enqueueFulfillment: queues.esim } as never,
      );

      const error = await dispatch.retryOrderFulfillment('order-1', options).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(BadRequestException);
      expect((error as Error).message).toBe(
        'eSIM orders are not retried through the card provider',
      );
      expect(calls).toEqual(['findOrder']);
      expect(plainRetry).not.toHaveBeenCalled();
      expect(retryWithOptions).not.toHaveBeenCalled();
      expect(topupRetry).not.toHaveBeenCalled();
      expectNoQueues(queues);
      expectNoProviderWrites(fx);
    },
  );

  it('keeps a CARD retry on the card provider and off every queue', async () => {
    const provider = {
      retryFulfillment: jest.fn().mockResolvedValue({
        fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
        cardsDelivered: 0,
      }),
      retryFulfillmentWithOptions: jest.fn(),
    };
    const { dispatch, queues, topupService } = dispatchFor(order('CARD'), provider);

    await expect(dispatch.retryOrderFulfillment('card-1')).resolves.toEqual({
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
      cardsDelivered: 0,
    });
    expect(provider.retryFulfillment).toHaveBeenCalledWith('card-1');
    expect(provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(topupService.retryFulfillment).not.toHaveBeenCalled();
    expectNoQueues(queues);
  });

  it.each([
    [{ forceProviderId: 'provider-2' }],
    [{ skipProviderIds: ['provider-1'] }],
  ])('keeps a CARD option retry on retryFulfillmentWithOptions %j', async (options) => {
    const provider = {
      retryFulfillment: jest.fn(),
      retryFulfillmentWithOptions: jest.fn().mockResolvedValue({
        fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
        cardsDelivered: 0,
      }),
    };
    const { dispatch, queues, topupService } = dispatchFor(order('CARD'), provider);

    await dispatch.retryOrderFulfillment('card-1', options);
    expect(provider.retryFulfillmentWithOptions).toHaveBeenCalledWith('card-1', options);
    expect(provider.retryFulfillment).not.toHaveBeenCalled();
    expect(topupService.retryFulfillment).not.toHaveBeenCalled();
    expectNoQueues(queues);
  });

  it.each(['TOPUP', 'DATA'] as const)(
    'keeps a %s retry on the topup service even when a provider id is forced',
    async (type) => {
      const provider = {
        retryFulfillment: jest.fn(),
        retryFulfillmentWithOptions: jest.fn(),
      };
      const topupRetry = jest.fn().mockResolvedValue({ fulfillmentStatus: FulfillmentStatus.PENDING });
      const { dispatch, queues } = dispatchFor(order(type), provider, topupRetry);

      await dispatch.retryOrderFulfillment('order-1', { forceProviderId: 'provider-2' });
      expect(topupRetry).toHaveBeenCalledWith('order-1');
      expect(provider.retryFulfillment).not.toHaveBeenCalled();
      expect(provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
      expectNoQueues(queues);
    },
  );

  it.each(['CARD', 'TOPUP', 'DATA'] as const)(
    'rejects a persisted ESIM + %s retry before any provider or queue call',
    async (legacyType) => {
      const loaded = {
        ...order('ESIM'),
        orderItems: [
          ...order('ESIM').orderItems,
          { id: 'item-legacy', variantId: 'variant-legacy', quantity: 1, variant: { type: legacyType } },
        ],
      };
      const provider = {
        retryFulfillment: jest.fn(),
        retryFulfillmentWithOptions: jest.fn(),
      };
      const { dispatch, queues, topupService } = dispatchFor(loaded, provider);

      await expect(
        dispatch.retryOrderFulfillment('mixed', { forceProviderId: 'provider-2' }),
      ).rejects.toThrow('eSIM orders cannot include other product types');
      expect(provider.retryFulfillment).not.toHaveBeenCalled();
      expect(provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
      expect(topupService.retryFulfillment).not.toHaveBeenCalled();
      expectNoQueues(queues);
    },
  );

  function adminHarness(params: {
    paymentStatus?: OrderPaymentStatus;
    fulfillmentStatus?: FulfillmentStatus;
    variantType: 'ESIM' | 'CARD' | 'TOPUP' | 'DATA';
    providerTransactions?: Array<{ status: ProviderTransactionStatus; providerId: string }>;
    esim?: boolean;
  }) {
    const updateOrderFulfillmentStatus = jest.fn();
    const updatePaymentStatus = jest.fn();
    const audit = jest.fn();
    const attemptCreate = jest.fn();
    const attemptUpdate = jest.fn();
    const orderUpdate = jest.fn().mockResolvedValue({});
    const esimRecover = jest.fn().mockResolvedValue({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      created: false,
      queried: false,
      hasOpenCreate: false,
      hasReference: false,
    });
    const esimAdmin = new EsimAdminService(
      {
        orderItem: {
          findFirst: async () => (params.esim === false ? null : { id: 'item-1' }),
        },
        order: { update: orderUpdate },
        esimProviderAttempt: { create: attemptCreate, update: attemptUpdate },
      } as never,
      { insertOpenCreate: jest.fn(), findOpenCreate: jest.fn() } as never,
      { recoverExistingInstall: esimRecover, fulfill: jest.fn() } as never,
    );
    const provider = {
      retryFulfillment: jest.fn().mockResolvedValue({
        fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
        providerTransactionId: null,
        cardsDelivered: 0,
      }),
      retryFulfillmentWithOptions: jest.fn().mockResolvedValue({
        fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
        providerTransactionId: null,
        cardsDelivered: 0,
      }),
    };
    const topupRetry = jest.fn().mockResolvedValue({
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
      providerTransactionId: null,
      cardsDelivered: 0,
    });
    const queues = { esim: jest.fn(), provider: jest.fn(), topup: jest.fn() };
    const dispatch = new FulfillmentDispatchService(
      {
        findOrderForFulfillment: async () => order(params.variantType),
      } as never,
      { enqueueFulfillment: queues.provider } as never,
      { enqueueFulfillment: queues.topup } as never,
      provider as never,
      { retryFulfillment: topupRetry } as never,
      { enqueueFulfillment: queues.esim } as never,
    );
    const service = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: params.paymentStatus ?? OrderPaymentStatus.PAID,
          fulfillmentStatus: params.fulfillmentStatus ?? FulfillmentStatus.NEED_MANUAL_REVIEW,
          providerTransactions: params.providerTransactions ?? [],
        }),
        updateOrderFulfillmentStatus,
        updatePaymentStatus,
      } as never,
      dispatch,
      { record: audit } as never,
      {} as never,
      {} as never,
      esimAdmin,
    );
    return {
      service,
      provider,
      topupRetry,
      queues,
      audit,
      orderUpdate,
      attemptCreate,
      attemptUpdate,
      esimRecover,
      updateOrderFulfillmentStatus,
      updatePaymentStatus,
    };
  }

  it('recovers an eSIM order from retryFulfillment and does not open a CREATE', async () => {
    const harness = adminHarness({ variantType: 'ESIM' });

    const result = await harness.service.retryFulfillment('admin-1', 'order-1');

    expect(result).toEqual({
      fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
      providerTransactionId: null,
      cardsDelivered: 0,
    });
    expect(harness.esimRecover).toHaveBeenCalledWith('order-1');
    expect(harness.orderUpdate).not.toHaveBeenCalled();
    expect(harness.attemptCreate).not.toHaveBeenCalled();
    expect(harness.attemptUpdate).not.toHaveBeenCalled();
    expect(harness.provider.retryFulfillment).not.toHaveBeenCalled();
    expect(harness.provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(harness.topupRetry).not.toHaveBeenCalled();
    expect(harness.updatePaymentStatus).not.toHaveBeenCalled();
    expect(harness.updateOrderFulfillmentStatus).not.toHaveBeenCalled();
    expectNoQueues(harness.queues);
    expect(harness.audit.mock.calls[0][4]).toEqual(
      expect.objectContaining({
        esimRecovered: true,
        recovery: 'query_only',
        created: false,
        createOpened: false,
        queried: false,
      }),
    );
    expect(JSON.stringify(harness.audit.mock.calls[0][4])).not.toMatch(/LPA:1\$|qrSvg|appleSetupUrl|installSecret/);
  });

  it('throws from manualRecovery retry for the same eSIM order and does not acknowledge', async () => {
    const harness = adminHarness({ variantType: 'ESIM' });

    await expect(
      harness.service.manualRecovery('admin-1', 'order-1', { action: 'retry' } as never),
    ).rejects.toThrow('eSIM orders are not retried through the card provider');
    expect(harness.orderUpdate).not.toHaveBeenCalled();
    expect(harness.attemptCreate).not.toHaveBeenCalled();
    expect(harness.attemptUpdate).not.toHaveBeenCalled();
    expect(harness.provider.retryFulfillment).not.toHaveBeenCalled();
    expect(harness.provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(harness.audit).not.toHaveBeenCalled();
    expect(harness.updatePaymentStatus).not.toHaveBeenCalled();
    expect(harness.updateOrderFulfillmentStatus).not.toHaveBeenCalled();
    expectNoQueues(harness.queues);
  });

  it('rejects manualRecovery switch_provider for an eSIM order before the card provider', async () => {
    const fx = effects();
    const calls: string[] = [];
    const loaded = order('ESIM');
    const findOrder = jest.fn(async () => {
      calls.push('findOrder');
      return loaded;
    });
    const provider = realProvider(findOrder, fx);
    const retryWithOptions = jest.spyOn(provider, 'retryFulfillmentWithOptions');
    const plainRetry = jest.spyOn(provider, 'retryFulfillment');
    const attemptCreate = jest.fn();
    const orderUpdate = jest.fn();
    const audit = jest.fn();
    const updatePaymentStatus = jest.fn();
    const topupRetry = jest.fn();
    const queues = { esim: jest.fn(), provider: jest.fn(), topup: jest.fn() };
    const dispatch = new FulfillmentDispatchService(
      { findOrderForFulfillment: findOrder } as never,
      { enqueueFulfillment: queues.provider } as never,
      { enqueueFulfillment: queues.topup } as never,
      provider,
      { retryFulfillment: topupRetry } as never,
      { enqueueFulfillment: queues.esim } as never,
    );
    const service = new AdminOrderService(
      {
        findOrderById: async () => ({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.NEED_MANUAL_REVIEW,
          providerTransactions: [
            { status: ProviderTransactionStatus.FAILED, providerId: 'provider-1' },
          ],
        }),
        updatePaymentStatus,
      } as never,
      dispatch,
      { record: audit } as never,
      {} as never,
      {} as never,
      new EsimAdminService(
        {
          orderItem: { findFirst: async () => ({ id: 'item-1' }) },
          order: { update: orderUpdate },
          esimProviderAttempt: { create: attemptCreate, update: jest.fn() },
        } as never,
        { insertOpenCreate: jest.fn() } as never,
      ),
    );

    await expect(
      service.manualRecovery('admin-1', 'order-1', {
        action: 'switch_provider',
        providerId: 'provider-9',
      } as never),
    ).rejects.toThrow('eSIM orders are not retried through the card provider');
    expect(calls).toEqual(['findOrder']);
    expect(plainRetry).not.toHaveBeenCalled();
    expect(retryWithOptions).not.toHaveBeenCalled();
    expect(topupRetry).not.toHaveBeenCalled();
    expect(attemptCreate).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
    expect(updatePaymentStatus).not.toHaveBeenCalled();
    expectNoQueues(queues);
    expectNoProviderWrites(fx);
  });

  it.each(['CARD', 'TOPUP', 'DATA'] as const)(
    'routes retryFulfillment for %s through dispatch and not eSIM acknowledge',
    async (type) => {
      const harness = adminHarness({ variantType: type, esim: false });

      await harness.service.retryFulfillment('admin-1', 'order-1');

      if (type === 'CARD') {
        expect(harness.provider.retryFulfillment).toHaveBeenCalledWith('order-1');
        expect(harness.topupRetry).not.toHaveBeenCalled();
      } else {
        expect(harness.topupRetry).toHaveBeenCalledWith('order-1');
        expect(harness.provider.retryFulfillment).not.toHaveBeenCalled();
      }
      expect(harness.orderUpdate).not.toHaveBeenCalled();
      expect(harness.attemptCreate).not.toHaveBeenCalled();
      expect(harness.updatePaymentStatus).not.toHaveBeenCalled();
      expectNoQueues(harness.queues);
    },
  );

  it('refuses retryFulfillment when the eSIM order is not PAID and does not acknowledge', async () => {
    const harness = adminHarness({
      variantType: 'ESIM',
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
    });

    await expect(harness.service.retryFulfillment('admin-1', 'order-1')).rejects.toThrow(
      'Only PAID orders can be retried',
    );
    expect(harness.orderUpdate).not.toHaveBeenCalled();
    expect(harness.provider.retryFulfillment).not.toHaveBeenCalled();
    expect(harness.updatePaymentStatus).not.toHaveBeenCalled();
  });

  it('keeps dispatch queue mapping for CARD, TOPUP, DATA, and eSIM', async () => {
    const orders = new Map([
      ['card', order('CARD')],
      ['topup', order('TOPUP')],
      ['data', order('DATA')],
      ['esim', order('ESIM')],
    ]);
    const providerQueue = jest.fn(async (orderId: string) => `card-${orderId}`);
    const topupQueue = jest.fn(async (orderId: string) => `topup-${orderId}`);
    const esimQueue = jest.fn(async (orderId: string) => `esim-${orderId}`);
    const provider = {
      retryFulfillment: jest.fn(),
      retryFulfillmentWithOptions: jest.fn(),
    };
    const topupRetry = jest.fn();
    const dispatch = new FulfillmentDispatchService(
      { findOrderForFulfillment: async (id: string) => orders.get(id) ?? null } as never,
      { enqueueFulfillment: providerQueue } as never,
      { enqueueFulfillment: topupQueue } as never,
      provider as never,
      { retryFulfillment: topupRetry } as never,
      { enqueueFulfillment: esimQueue } as never,
    );

    await expect(dispatch.dispatchOrderFulfillment('card')).resolves.toEqual(['card-card']);
    await expect(dispatch.dispatchOrderFulfillment('topup')).resolves.toEqual(['topup-topup']);
    await expect(dispatch.dispatchOrderFulfillment('data')).resolves.toEqual(['topup-data']);
    await expect(dispatch.dispatchOrderFulfillment('esim')).resolves.toEqual(['esim-esim']);
    expect(providerQueue).toHaveBeenCalledTimes(1);
    expect(providerQueue).toHaveBeenCalledWith('card', 'webhook');
    expect(topupQueue).toHaveBeenNthCalledWith(1, 'topup', 'webhook');
    expect(topupQueue).toHaveBeenNthCalledWith(2, 'data', 'webhook');
    expect(esimQueue).toHaveBeenCalledTimes(1);
    expect(esimQueue).toHaveBeenCalledWith('esim');
    expect(provider.retryFulfillment).not.toHaveBeenCalled();
    expect(provider.retryFulfillmentWithOptions).not.toHaveBeenCalled();
    expect(topupRetry).not.toHaveBeenCalled();
  });
});
