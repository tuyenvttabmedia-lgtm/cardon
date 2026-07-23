/**
 * Phase 6N — Topup fulfillment tests
 */
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  ProductVariantType,
  ProviderStatus,
  ProviderTransactionAction,
  ProviderTransactionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { MockESaleProvider } from './adapters/mock-esale.provider';
import { MockIMediaProvider } from './adapters/mock-imedia.provider';
import { ProviderMappingRepository } from '../product/repositories/provider-mapping.repository';
import {
  ProviderOrderRepository,
  ProviderRepository,
  ProviderTransactionRepository,
  TopupTransactionRepository,
} from './repositories/provider.repository';
import { ProviderAuditService } from './services/provider-audit.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { TopupService } from './services/topup.service';

function buildTopupContext() {
  MockESaleProvider.reset();
  MockESaleProvider.topupBehavior = 'SUCCESS';

  const mappingRepository = {
    findActiveByVariantId: jest.fn().mockResolvedValue([
      {
        id: 'map-viettel',
        providerProductCode: 'viettel:50000',
        priority: 0,
        providerCost: 48000,
        availability: 'AVAILABLE',
        provider: {
          id: 'provider-esale-1',
          code: 'ESALE',
          name: 'Mock eSale',
          status: ProviderStatus.ACTIVE,
          deletedAt: null,
        },
      },
    ]),
  } as unknown as ProviderMappingRepository;

  const esale = new MockESaleProvider();
  const topupSpy = jest.spyOn(esale, 'topup');
  const checkSpy = jest.spyOn(esale, 'checkTransaction');
  const runtimeSettings = {
    isProviderInMaintenance: jest.fn().mockResolvedValue(false),
  };
  const registry = ProviderRegistryService.withAdapters(
    mappingRepository,
    runtimeSettings as never,
    esale,
    new MockIMediaProvider(),
  );

  const paidTopupOrder = {
    id: 'order-topup-1',
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: FulfillmentStatus.PENDING,
    guestPhone: '0912345678',
    customerNote: 'Nạp số: 0912345678',
    orderItems: [
      {
        id: 'item-topup-1',
        variantId: 'variant-viettel-50k',
        quantity: 1,
        variant: {
          id: 'variant-viettel-50k',
          type: ProductVariantType.TOPUP,
          sku: 'VIETTEL-50K',
          faceValue: new Decimal(50000),
        },
      },
    ],
  };

  const orderRepository = {
    findOrderForFulfillment: jest.fn().mockResolvedValue(paidTopupOrder),
    claimFulfillmentProcessing: jest.fn().mockResolvedValue({ count: 1 }),
    updateFulfillmentStatus: jest.fn(),
    updateOrderItemStatus: jest.fn(),
  };

  const transactionRepository = {
    create: jest.fn().mockImplementation(async (data) => ({
      id: 'txn-topup-1',
      ...data,
    })),
    updateResult: jest.fn(),
    findMaxAttempt: jest.fn().mockResolvedValue({ _max: { attempt: 0 } }),
    findLatestRecoverable: jest.fn().mockResolvedValue(null),
    findRecoverableAttempts: jest.fn().mockResolvedValue([]),
  };

  const topupTransactionRepository = {
    findByOrderItemId: jest.fn().mockResolvedValue(null),
    upsertSuccess: jest.fn().mockResolvedValue({ id: 'topup-row-1' }),
    upsertFailed: jest.fn(),
  };

  const providerRepository = {
    createProviderLog: jest.fn(),
  };

  const providerAudit = {
    recordAttempt: jest.fn(),
    recordSuccess: jest.fn(),
    recordFailed: jest.fn(),
    recordRetry: jest.fn(),
  };

  const prisma = {
    $transaction: jest.fn(async (cb) => cb({})),
  };

  const notificationService = {
    notifyTopupDelivery: jest.fn(),
    notifyAdminRetryRequired: jest.fn(),
  };

  const service = new TopupService(
    prisma as never,
    registry,
    providerRepository as never,
    orderRepository as never,
    transactionRepository as never,
    topupTransactionRepository as never,
    providerAudit as never,
    notificationService as never,
  );

  return {
    service,
    paidTopupOrder,
    orderRepository,
    transactionRepository,
    topupTransactionRepository,
    topupSpy,
    checkSpy,
    notificationService,
  };
}

describe('TopupService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    MockESaleProvider.reset();
  });

  it('fulfills TOPUP order successfully and persists topup transaction', async () => {
    const ctx = buildTopupContext();

    const result = await ctx.service.fulfillOrder('order-topup-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(ctx.transactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: ProviderTransactionAction.TOPUP,
        status: ProviderTransactionStatus.PROCESSING,
      }),
    );
    expect(ctx.topupTransactionRepository.upsertSuccess).toHaveBeenCalled();
    expect(ctx.topupSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: '0912345678',
        amount: 50000,
      }),
    );
  });

  it('recovers from TIMEOUT via checkTransaction without blind retry', async () => {
    const ctx = buildTopupContext();
    MockESaleProvider.topupBehavior = 'TIMEOUT';
    MockESaleProvider.timeoutRecovery.set('mock-request', {
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: 'ESALE-RECOVERED',
      providerReference: 'mock-request',
      rawResponse: { recovered: true },
    });

    ctx.transactionRepository.create.mockImplementation(async (data) => ({
      id: 'txn-topup-timeout',
      requestId: 'REQ-TIMEOUT-1',
      providerTransactionDate: '2025-06-21 10:00:00',
      providerMetadata: { kind: 'TOPUP', requestTime: '1710000000' },
      ...data,
    }));

    ctx.topupSpy.mockImplementation(async (params) => ({
      success: false,
      status: ProviderTransactionStatus.TIMEOUT,
      failureCode: 'TIMEOUT',
      message: 'timeout',
      rawResponse: { requestId: params.requestId },
    }));

    ctx.checkSpy.mockResolvedValue({
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: 'ESALE-RECOVERED',
      providerReference: 'REQ-TIMEOUT-1',
      rawResponse: { recovered: true },
    });

    const result = await ctx.service.fulfillOrder('order-topup-1');

    expect(ctx.checkSpy).toHaveBeenCalled();
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
  });

  it('maps provider LOW_BALANCE to WAITING_ADMIN_RETRY', async () => {
    const ctx = buildTopupContext();
    MockESaleProvider.topupBehavior = 'LOW_BALANCE';

    const result = await ctx.service.fulfillOrder('order-topup-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
    expect(ctx.notificationService.notifyAdminRetryRequired).toHaveBeenCalledWith('order-topup-1');
  });

  it('recovers worker restart from persisted PROCESSING transaction', async () => {
    const ctx = buildTopupContext();
    const processingOrder = {
      ...ctx.paidTopupOrder,
      fulfillmentStatus: FulfillmentStatus.PROCESSING,
    };
    ctx.orderRepository.findOrderForFulfillment.mockResolvedValue(processingOrder);

    ctx.transactionRepository.findLatestRecoverable.mockResolvedValue({
      id: 'txn-existing',
      requestId: 'REQ-EXISTING',
      status: ProviderTransactionStatus.PROCESSING,
      providerTransactionDate: '2025-06-21 10:00:00',
      providerMetadata: { kind: 'TOPUP', requestTime: '1710000000' },
    });

    ctx.checkSpy.mockResolvedValue({
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: 'ESALE-EXISTING',
      providerReference: 'REQ-EXISTING',
      rawResponse: { recovered: true },
    });

    const result = await ctx.service.fulfillOrder('order-topup-1');

    expect(ctx.checkSpy).toHaveBeenCalled();
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(ctx.topupSpy).not.toHaveBeenCalled();
  });

  it('admin retry on TIMEOUT only checkTransaction — never opens a new topup', async () => {
    const ctx = buildTopupContext();
    const waitingOrder = {
      ...ctx.paidTopupOrder,
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    };
    ctx.orderRepository.findOrderForFulfillment.mockResolvedValue(waitingOrder);

    const timeoutTxn = {
      id: 'txn-timeout-1',
      requestId: 'REQ-TIMEOUT-PRIOR',
      status: ProviderTransactionStatus.TIMEOUT,
      attempt: 1,
      providerTransactionDate: '2025-06-21 10:00:00',
      providerMetadata: { kind: 'TOPUP', requestTime: '1710000000' },
    };
    ctx.transactionRepository.findLatestRecoverable.mockResolvedValue(timeoutTxn);
    ctx.transactionRepository.findRecoverableAttempts = jest
      .fn()
      .mockResolvedValue([timeoutTxn]);

    ctx.checkSpy.mockResolvedValue({
      success: false,
      status: ProviderTransactionStatus.PENDING,
      failureCode: 'TIMEOUT',
      message: 'Processing',
      rawResponse: { retCode: 2, retMsg: 'Processing' },
    });

    const result = await ctx.service.retryFulfillment('order-topup-1');

    expect(ctx.topupSpy).not.toHaveBeenCalled();
    expect(ctx.checkSpy).toHaveBeenCalled();
    expect(ctx.transactionRepository.create).not.toHaveBeenCalled();
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
  });
});

describe('FulfillmentDispatchService routing', () => {
  it('enqueues topup_queue for TOPUP orders', async () => {
    const { FulfillmentDispatchService } = await import('./services/fulfillment-dispatch.service');
    const orderRepository = {
      findOrderForFulfillment: jest.fn().mockResolvedValue({
        orderItems: [{ variant: { type: ProductVariantType.TOPUP } }],
      }),
    };
    const providerQueue = { enqueueFulfillment: jest.fn() };
    const topupQueue = { enqueueFulfillment: jest.fn().mockResolvedValue('topup-job-1') };

    const dispatch = new FulfillmentDispatchService(
      orderRepository as never,
      providerQueue as never,
      topupQueue as never,
      {} as never,
      {} as never,
    );

    const jobs = await dispatch.dispatchOrderFulfillment('order-topup-1', 'webhook');

    expect(topupQueue.enqueueFulfillment).toHaveBeenCalledWith('order-topup-1', 'webhook');
    expect(providerQueue.enqueueFulfillment).not.toHaveBeenCalled();
    expect(jobs).toEqual(['topup-job-1']);
  });
});
