/**
 * Phase 2F — Provider Core Tests
 */
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  ProductVariantType,
  ProviderStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { MockESaleProvider } from './adapters/mock-esale.provider';
import { MockIMediaProvider } from './adapters/mock-imedia.provider';
import { ProviderMappingRepository } from '../product/repositories/provider-mapping.repository';
import {
  CardRecordRepository,
  ProviderOrderRepository,
  ProviderRepository,
  ProviderTransactionRepository,
} from './repositories/provider.repository';
import { CardEncryptionService } from './services/card-encryption.service';
import { ProviderAuditService } from './services/provider-audit.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { ProviderService } from './services/provider.service';

const TEST_ENCRYPTION_KEY = '01234567890123456789012345678901';

function buildService() {
  const mappingRepository = {
    findActiveByVariantId: jest.fn().mockResolvedValue([
      {
        id: 'map-1',
        providerProductCode: 'ESALE-SKU-001',
        priority: 0,
        providerCost: 9000,
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

  const runtimeSettings = {
    isProviderInMaintenance: jest.fn().mockResolvedValue(false),
  };

  const esale = new MockESaleProvider();
  const registry = ProviderRegistryService.withAdapters(
    mappingRepository,
    runtimeSettings as never,
    esale,
    new MockIMediaProvider(),
  );

  const orderRepository = {
    findOrderForFulfillment: jest.fn(),
    claimFulfillmentProcessing: jest.fn().mockResolvedValue({ count: 1 }),
    updateFulfillmentStatus: jest.fn(),
    updateOrderItemStatus: jest.fn(),
  };

  const transactionRepository = {
    create: jest.fn().mockImplementation(async (data) => ({
      id: `txn-${data.attempt}`,
      ...data,
    })),
    updateResult: jest.fn(),
    findMaxAttempt: jest.fn().mockResolvedValue({ _max: { attempt: 0 } }),
    findLatestSuccess: jest.fn().mockResolvedValue(null),
    findLatestRecoverable: jest.fn().mockResolvedValue(null),
    listByOrderId: jest.fn().mockResolvedValue([]),
  };

  const cardRecordRepository = {
    createMany: jest.fn().mockResolvedValue({ count: 10 }),
    countByOrderItemId: jest.fn().mockResolvedValue(0),
  };

  const providerRepository = {
    createProviderLog: jest.fn(),
    findProviderById: jest.fn(),
    updateBalance: jest.fn(),
    createNotification: jest.fn(),
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

  const cardEncryption = new CardEncryptionService({
    get: (key: string) =>
      key === 'encryption.key' ? TEST_ENCRYPTION_KEY : undefined,
  } as ConfigService);

  const queueProducer = {
    enqueueDelayedRetry: jest.fn().mockResolvedValue('job-1'),
    enqueueFulfillment: jest.fn(),
    enqueueRetry: jest.fn(),
  };

  const service = new ProviderService(
    prisma as never,
    registry,
    providerRepository as never,
    orderRepository as never,
    transactionRepository as never,
    cardRecordRepository as never,
    cardEncryption,
    providerAudit as never,
    { notifyCardDelivery: jest.fn(), notifyAdminRetryRequired: jest.fn() } as never,
    queueProducer as never,
    { recordApiCall: jest.fn() } as never,
    { evaluateProvider: jest.fn().mockResolvedValue(false) } as never,
    { record: jest.fn() } as never,
  );

  const paidCardOrder = {
    id: 'order-1',
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: FulfillmentStatus.PENDING as FulfillmentStatus,
    orderItems: [
      {
        id: 'item-1',
        variantId: 'variant-1',
        quantity: 10,
        variant: {
          id: 'variant-1',
          type: ProductVariantType.CARD,
          sku: 'CARD-10K',
          faceValue: 10000,
        },
      },
    ],
  };

  orderRepository.findOrderForFulfillment.mockResolvedValue(paidCardOrder);

  return {
    service,
    orderRepository,
    transactionRepository,
    cardRecordRepository,
    providerAudit,
    cardEncryption,
    paidCardOrder,
  };
}

describe('ProviderService', () => {
  beforeEach(() => {
    MockESaleProvider.reset();
  });

  it('delivers cards successfully on PAID order', async () => {
    const { service, cardRecordRepository, providerAudit } = buildService();

    const result = await service.fulfillOrder('order-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.cardsDelivered).toBe(10);
    expect(cardRecordRepository.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          orderItemId: 'item-1',
          encryptedSerial: expect.any(String),
          encryptedPin: expect.any(String),
        }),
      ]),
      expect.anything(),
    );
    expect(providerAudit.recordSuccess).toHaveBeenCalled();
  });

  it('creates 10 card_records for quantity=10', async () => {
    const { service, cardRecordRepository } = buildService();

    await service.fulfillOrder('order-1');

    const records = cardRecordRepository.createMany.mock.calls[0][0] as unknown[];
    expect(records).toHaveLength(10);
  });

  it('never stores plain PIN — only encrypted values', async () => {
    const { service, cardRecordRepository, cardEncryption } = buildService();

    await service.fulfillOrder('order-1');

    const records = cardRecordRepository.createMany.mock.calls[0][0] as Array<{
      encryptedPin: string;
      encryptedSerial: string;
    }>;

    for (const record of records) {
      expect(record.encryptedPin).not.toMatch(/^PIN-/);
      expect(record.encryptedSerial).not.toMatch(/^SN-/);
      expect(cardEncryption.decrypt(record.encryptedPin)).toMatch(/^PIN-/);
    }
  });

  it('sets WAITING_ADMIN_RETRY on OUT_OF_STOCK without refund', async () => {
    MockESaleProvider.buyCardBehavior = 'OUT_OF_STOCK';
    const { service, orderRepository, providerAudit } = buildService();

    const result = await service.fulfillOrder('order-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
    expect(orderRepository.updateFulfillmentStatus).toHaveBeenCalledWith(
      'order-1',
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    );
    expect(providerAudit.recordFailed).toHaveBeenCalled();
  });

  it('sets WAITING_ADMIN_RETRY on LOW_BALANCE', async () => {
    MockESaleProvider.buyCardBehavior = 'LOW_BALANCE';
    const { service } = buildService();

    const result = await service.fulfillOrder('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
  });

  it('sets WAITING_ADMIN_RETRY when all providers are in maintenance', async () => {
    const mappingRepository = {
      findActiveByVariantId: jest.fn().mockResolvedValue([
        {
          id: 'map-1',
          providerProductCode: 'ESALE-SKU-001',
          priority: 0,
          providerCost: 9000,
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

    const runtimeSettings = {
      isProviderInMaintenance: jest.fn().mockResolvedValue(true),
    };
    const registry = ProviderRegistryService.withAdapters(
      mappingRepository,
      runtimeSettings as never,
      new MockESaleProvider(),
      new MockIMediaProvider(),
    );

    const ctx = buildService();
    const service = new ProviderService(
      { $transaction: jest.fn(async (cb) => cb({})) } as never,
      registry,
      { createProviderLog: jest.fn() } as never,
      ctx.orderRepository as never,
      ctx.transactionRepository as never,
      ctx.cardRecordRepository as never,
      ctx.cardEncryption,
      ctx.providerAudit as never,
      { notifyCardDelivery: jest.fn(), notifyAdminRetryRequired: jest.fn() } as never,
      {
        enqueueDelayedRetry: jest.fn(),
        enqueueFulfillment: jest.fn(),
        enqueueRetry: jest.fn(),
      } as never,
      { recordApiCall: jest.fn() } as never,
      { evaluateProvider: jest.fn().mockResolvedValue(false) } as never,
      { record: jest.fn() } as never,
    );

    const result = await service.fulfillOrder('order-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
    expect(result.failureCode).toBe('MAINTENANCE');
    expect(ctx.orderRepository.updateFulfillmentStatus).toHaveBeenCalledWith(
      'order-1',
      FulfillmentStatus.WAITING_ADMIN_RETRY,
    );
    expect(ctx.orderRepository.claimFulfillmentProcessing).not.toHaveBeenCalled();
  });

  it('admin retry can recover PAID+PENDING after provider becomes available', async () => {
    const ctx = buildService();
    ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.PENDING;
    MockESaleProvider.buyCardBehavior = 'SUCCESS';

    const result = await ctx.service.retryFulfillment('order-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
  });

  it('recovers from TIMEOUT via checkTransaction when found', async () => {
    MockESaleProvider.buyCardBehavior = 'TIMEOUT';
    const { service, transactionRepository } = buildService();

    transactionRepository.create.mockImplementation(async (data) => {
      MockESaleProvider.timeoutRecovery.set(data.requestId, {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: 'RECOVERED-TXN',
        cards: Array.from({ length: 10 }, (_, i) => ({
          serial: `REC-SN-${i + 1}`,
          pin: `REC-PIN-${i + 1}`,
        })),
      });
      return { id: 'txn-1', ...data };
    });

    const result = await service.fulfillOrder('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(result.providerTransactionId).toBe('RECOVERED-TXN');
  });

  it('sets WAITING_ADMIN_RETRY when TIMEOUT and checkTransaction not found', async () => {
    MockESaleProvider.buyCardBehavior = 'TIMEOUT';
    const { service } = buildService();

    const result = await service.fulfillOrder('order-1');
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
  });

  it('manual retry creates new provider_transaction attempt', async () => {
    const ctx = buildService();
    MockESaleProvider.buyCardBehavior = 'OUT_OF_STOCK';
    await ctx.service.fulfillOrder('order-1');

    ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.WAITING_ADMIN_RETRY;
    ctx.transactionRepository.findMaxAttempt.mockResolvedValue({
      _max: { attempt: 1 },
    });
    MockESaleProvider.buyCardBehavior = 'SUCCESS';

    await ctx.service.retryFulfillment('order-1');

    expect(ctx.transactionRepository.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ attempt: 2 }),
    );
    expect(ctx.providerAudit.recordRetry).toHaveBeenCalled();
  });

  it('keeps history of multiple provider attempts', async () => {
    const ctx = buildService();
    MockESaleProvider.buyCardBehavior = 'OUT_OF_STOCK';
    await ctx.service.fulfillOrder('order-1');

    ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.WAITING_ADMIN_RETRY;
    ctx.transactionRepository.findMaxAttempt.mockResolvedValue({
      _max: { attempt: 1 },
    });
    MockESaleProvider.buyCardBehavior = 'SUCCESS';
    await ctx.service.retryFulfillment('order-1');

    expect(ctx.transactionRepository.create).toHaveBeenCalledTimes(2);
  });
});

describe('ProviderRegistryService', () => {
  it('selects enabled provider by priority and active mapping', async () => {
    const mappingRepository = {
      findActiveByVariantId: jest.fn().mockResolvedValue([
        {
          id: 'map-high',
          providerProductCode: 'SKU-A',
          priority: 0,
          provider: {
            id: 'p1',
            code: 'ESALE',
            status: ProviderStatus.ACTIVE,
            deletedAt: null,
          },
        },
        {
          id: 'map-low',
          providerProductCode: 'SKU-B',
          priority: 1,
          provider: {
            id: 'p2',
            code: 'IMEDIA',
            status: ProviderStatus.ACTIVE,
            deletedAt: null,
          },
        },
      ]),
    } as unknown as ProviderMappingRepository;

    const registry = ProviderRegistryService.withAdapters(
      mappingRepository,
      { isProviderInMaintenance: jest.fn().mockResolvedValue(false) } as never,
      new MockESaleProvider(),
      new MockIMediaProvider(),
    );

    const selected = await registry.selectForVariant('variant-1');
    expect(selected.provider.code).toBe('ESALE');
    expect(selected.mapping.providerProductCode).toBe('SKU-A');
  });

  it('skips DEGRADED providers from routing', async () => {
    const mappingRepository = {
      findActiveByVariantId: jest.fn().mockResolvedValue([
        {
          id: 'map-degraded',
          providerProductCode: 'SKU-D',
          priority: 0,
          provider: {
            id: 'p-degraded',
            code: 'ESALE',
            status: ProviderStatus.DEGRADED,
            deletedAt: null,
          },
        },
        {
          id: 'map-active',
          providerProductCode: 'SKU-B',
          priority: 1,
          provider: {
            id: 'p2',
            code: 'IMEDIA',
            status: ProviderStatus.ACTIVE,
            deletedAt: null,
          },
        },
      ]),
    } as unknown as ProviderMappingRepository;

    const registry = ProviderRegistryService.withAdapters(
      mappingRepository,
      { isProviderInMaintenance: jest.fn().mockResolvedValue(false) } as never,
      new MockESaleProvider(),
      new MockIMediaProvider(),
    );

    const selections = await registry.listForVariant('variant-1');
    expect(selections).toHaveLength(1);
    expect(selections[0].provider.code).toBe('IMEDIA');
  });
});
