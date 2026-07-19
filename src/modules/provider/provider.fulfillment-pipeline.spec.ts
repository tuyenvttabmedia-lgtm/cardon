/**
 * Phase 6G.1 — Fulfillment pipeline regression (payment → provider → cards)
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

function buildPipelineContext() {
  MockESaleProvider.reset();
  MockESaleProvider.buyCardBehavior = 'SUCCESS';

  const mappingRepository = {
    findActiveByVariantId: jest.fn().mockResolvedValue([
      {
        id: 'map-garena',
        providerProductCode: 'GARENA|100000|Card',
        priority: 0,
        providerCost: 95000,
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
  const buyCardSpy = jest.spyOn(esale, 'buyCard');
  const registry = ProviderRegistryService.withAdapters(
    mappingRepository,
    esale,
    new MockIMediaProvider(),
  );

  const paidCardOrder = {
    id: 'order-pipeline-1',
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: FulfillmentStatus.PENDING,
    orderItems: [
      {
        id: 'item-pipeline-1',
        variantId: 'variant-garena',
        quantity: 1,
        variant: {
          id: 'variant-garena',
          type: ProductVariantType.CARD,
          sku: 'GARENA-100K',
        },
      },
    ],
  };

  const orderRepository = {
    findOrderForFulfillment: jest.fn().mockResolvedValue(paidCardOrder),
    claimFulfillmentProcessing: jest.fn().mockResolvedValue({ count: 1 }),
    updateFulfillmentStatus: jest.fn(),
    updateOrderItemStatus: jest.fn(),
  };

  const transactionRepository = {
    create: jest.fn().mockImplementation(async (data) => ({
      id: 'txn-pipeline-1',
      ...data,
    })),
    updateResult: jest.fn(),
    findMaxAttempt: jest.fn().mockResolvedValue({ _max: { attempt: 0 } }),
    findLatestSuccess: jest.fn().mockResolvedValue(null),
    findLatestRecoverable: jest.fn().mockResolvedValue(null),
    listByOrderId: jest.fn().mockResolvedValue([]),
  };

  const cardRecordRepository = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    countByOrderItemId: jest.fn().mockResolvedValue(0),
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

  const cardEncryption = new CardEncryptionService({
    get: (key: string) =>
      key === 'encryption.key' ? TEST_ENCRYPTION_KEY : undefined,
  } as ConfigService);

  const notificationService = {
    notifyCardDelivery: jest.fn(),
    notifyAdminRetryRequired: jest.fn(),
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
    notificationService as never,
  );

  return {
    service,
    paidCardOrder,
    orderRepository,
    transactionRepository,
    cardRecordRepository,
    buyCardSpy,
  };
}

describe('Phase 6G.1 Fulfillment pipeline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    MockESaleProvider.reset();
  });

  it('creates provider transaction and card records after PAID order fulfillment', async () => {
    const ctx = buildPipelineContext();

    const result = await ctx.service.fulfillOrder('order-pipeline-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(ctx.transactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-pipeline-1',
        status: ProviderTransactionStatus.PROCESSING,
      }),
    );
    expect(ctx.cardRecordRepository.createMany).toHaveBeenCalled();
    expect(ctx.buyCardSpy).toHaveBeenCalledTimes(1);
  });

  it('recovers zombie PROCESSING order without provider transaction and completes', async () => {
    const ctx = buildPipelineContext();
    const processingOrder = {
      ...ctx.paidCardOrder,
      fulfillmentStatus: FulfillmentStatus.PROCESSING,
    };
    ctx.orderRepository.findOrderForFulfillment.mockResolvedValue(processingOrder);
    ctx.orderRepository.claimFulfillmentProcessing.mockResolvedValue({ count: 0 });

    const result = await ctx.service.fulfillOrder('order-pipeline-1');

    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    expect(ctx.transactionRepository.create).toHaveBeenCalled();
    expect(ctx.cardRecordRepository.createMany).toHaveBeenCalled();
    expect(ctx.buyCardSpy).toHaveBeenCalledTimes(1);
  });
});
