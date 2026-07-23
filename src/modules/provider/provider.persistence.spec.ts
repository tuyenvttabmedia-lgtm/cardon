/**
 * Phase 2F.3 — Provider Persistence Hardening Tests
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
const PERSISTED_TXN_DATE = '2026-06-19 14:30:00';
const PERSISTED_REQUEST_TIME = '1781810000';

function buildPersistenceContext() {
  MockESaleProvider.reset();

  const mappingRepository = {
    findActiveByVariantId: jest.fn().mockResolvedValue([
      {
        id: 'map-1',
        providerProductCode: 'VIETTEL:35',
        priority: 0,
        providerCost: 9000,
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
  const checkTransactionSpy = jest.spyOn(esale, 'checkTransaction');

  const registry = ProviderRegistryService.withAdapters(
    mappingRepository,
    esale,
    new MockIMediaProvider(),
  );

  const paidCardOrder = {
    id: 'order-persist-1',
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: FulfillmentStatus.PENDING as FulfillmentStatus,
    orderItems: [
      {
        id: 'item-persist-1',
        variantId: 'variant-1',
        quantity: 10,
        variant: {
          id: 'variant-1',
          type: ProductVariantType.CARD,
          sku: 'CARD-10K',
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
      id: `txn-${data.attempt}`,
      ...data,
    })),
    updateResult: jest.fn(),
    findMaxAttempt: jest.fn().mockResolvedValue({ _max: { attempt: 0 } }),
    findLatestRecoverable: jest.fn().mockResolvedValue(null),
    findRecoverableAttempts: jest.fn().mockResolvedValue([]),
    findLatestSuccess: jest.fn().mockResolvedValue(null),
    listByOrderId: jest.fn().mockResolvedValue([]),
  };

  const cardRecordRepository = {
    createMany: jest.fn().mockResolvedValue({ count: 10 }),
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
  );

  return {
    service,
    esale,
    buyCardSpy,
    checkTransactionSpy,
    orderRepository,
    transactionRepository,
    cardRecordRepository,
    paidCardOrder,
  };
}

describe('Phase 2F.3 Provider Persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    MockESaleProvider.reset();
  });

  it('persists PROCESSING transaction with transactionDate before buyCard', async () => {
    const ctx = buildPersistenceContext();

    await ctx.service.fulfillOrder('order-persist-1');

    expect(ctx.transactionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ProviderTransactionStatus.PROCESSING,
        providerTransactionDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2} /),
        providerMetadata: expect.objectContaining({
          requestTime: expect.any(String),
          kind: 'CARD',
        }),
      }),
    );
    expect(ctx.buyCardSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        providerTransactionDate: expect.any(String),
        providerRequestTime: expect.any(String),
      }),
    );
  });

  it('recovers after simulated worker restart using persisted metadata', async () => {
    MockESaleProvider.buyCardBehavior = 'TIMEOUT';
    const ctx = buildPersistenceContext();

    let requestId = '';
    ctx.transactionRepository.create.mockImplementation(async (data) => {
      requestId = data.requestId;
      MockESaleProvider.timeoutRecovery.set(data.requestId, {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: 'ESALE-RESTART-OK',
        cards: Array.from({ length: 10 }, (_, i) => ({
          serial: `SN-${i + 1}`,
          pin: `PIN-${i + 1}`,
        })),
      });
      return {
        id: 'txn-processing-1',
        ...data,
        providerTransactionDate: PERSISTED_TXN_DATE,
        providerMetadata: {
          requestTime: PERSISTED_REQUEST_TIME,
          kind: 'CARD',
        },
      };
    });

    await ctx.service.fulfillOrder('order-persist-1');

    ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.PROCESSING;
    ctx.transactionRepository.findLatestRecoverable.mockResolvedValue({
      id: 'txn-processing-1',
      requestId,
      providerTransactionId: null,
      status: ProviderTransactionStatus.PROCESSING,
      attempt: 1,
      providerTransactionDate: PERSISTED_TXN_DATE,
      providerMetadata: {
        requestTime: PERSISTED_REQUEST_TIME,
        kind: 'CARD',
      },
    });

    ctx.buyCardSpy.mockClear();
    ctx.checkTransactionSpy.mockClear();

    const result = await ctx.service.fulfillOrder('order-persist-1');

    expect(ctx.buyCardSpy).not.toHaveBeenCalled();
    expect(ctx.checkTransactionSpy).toHaveBeenCalledWith(
      requestId,
      expect.objectContaining({
        providerTransactionDate: PERSISTED_TXN_DATE,
        providerRequestTime: PERSISTED_REQUEST_TIME,
      }),
    );
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
  });

  it('retry after restart does not buy twice when PROCESSING txn is recoverable', async () => {
    const ctx = buildPersistenceContext();
    ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.WAITING_ADMIN_RETRY;

    ctx.transactionRepository.findLatestRecoverable.mockResolvedValue({
      id: 'txn-processing-2',
      requestId: 'REQ-RETRY-RECOVER',
      status: ProviderTransactionStatus.PROCESSING,
      attempt: 1,
      providerTransactionDate: PERSISTED_TXN_DATE,
      providerMetadata: {
        requestTime: PERSISTED_REQUEST_TIME,
        kind: 'CARD',
      },
    });

    MockESaleProvider.timeoutRecovery.set('REQ-RETRY-RECOVER', {
      success: true,
      status: ProviderTransactionStatus.SUCCESS,
      providerTransactionId: 'ESALE-RETRY-OK',
      cards: Array.from({ length: 10 }, (_, i) => ({
        serial: `SN-${i + 1}`,
        pin: `PIN-${i + 1}`,
      })),
    });

    const result = await ctx.service.retryFulfillment('order-persist-1');

    expect(ctx.buyCardSpy).not.toHaveBeenCalled();
    expect(ctx.transactionRepository.create).not.toHaveBeenCalled();
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
  });

  it('passes persisted context on timeout recovery within same run', async () => {
    const ctx = buildPersistenceContext();
    MockESaleProvider.buyCardBehavior = 'TIMEOUT';

    let capturedRequestId = '';
    ctx.transactionRepository.create.mockImplementation(async (data) => {
      capturedRequestId = data.requestId;
      MockESaleProvider.timeoutRecovery.set(data.requestId, {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: 'ESALE-TIMEOUT-OK',
        cards: Array.from({ length: 10 }, (_, i) => ({
          serial: `SN-${i + 1}`,
          pin: `PIN-${i + 1}`,
        })),
      });
      return {
        id: 'txn-timeout-1',
        ...data,
        providerTransactionDate: PERSISTED_TXN_DATE,
        providerMetadata: {
          requestTime: PERSISTED_REQUEST_TIME,
          kind: 'CARD',
        },
      };
    });

    const result = await ctx.service.fulfillOrder('order-persist-1');

    expect(ctx.checkTransactionSpy).toHaveBeenCalledWith(
      capturedRequestId,
      expect.objectContaining({
        providerTransactionDate: PERSISTED_TXN_DATE,
        providerRequestTime: PERSISTED_REQUEST_TIME,
      }),
    );
    expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
  });
});
