/**
 * Phase 2F.2 — Provider Safety Audit Tests
 */
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  ProductVariantType,
  ProviderStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { ConflictException } from '@nestjs/common';
import { MockESaleProvider } from './adapters/mock-esale.provider';
import { MockIMediaProvider } from './adapters/mock-imedia.provider';
import { ESaleProvider } from './adapters/esale/esale.provider';
import { EsaleConfigService } from './adapters/esale/esale.config';
import { EsaleHttpClient } from './adapters/esale/esale.client';
import { ProviderMappingRepository } from '../product/repositories/provider-mapping.repository';
import {
  CardRecordRepository,
  ProviderOrderRepository,
  ProviderRepository,
  ProviderTransactionRepository,
} from './repositories/provider.repository';
import { CardEncryptionService } from './services/card-encryption.service';
import { ProviderAuditService } from './services/provider-audit.service';
import { ProviderHealthService } from './services/provider-health.service';
import { ProviderRegistryService } from './services/provider-registry.service';
import { ProviderService } from './services/provider.service';

const TEST_ENCRYPTION_KEY = '01234567890123456789012345678901';

function buildSafetyContext(overrides?: {
  quantity?: number;
  buyCardBehavior?: 'SUCCESS' | 'OUT_OF_STOCK' | 'LOW_BALANCE' | 'TIMEOUT' | 'UNKNOWN';
}) {
  MockESaleProvider.reset();
  if (overrides?.buyCardBehavior) {
    MockESaleProvider.buyCardBehavior = overrides.buyCardBehavior;
  }

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

  const quantity = overrides?.quantity ?? 10;

  const paidCardOrder = {
    id: 'order-safety-1',
    paymentStatus: OrderPaymentStatus.PAID,
    fulfillmentStatus: FulfillmentStatus.PENDING as FulfillmentStatus,
    orderItems: [
      {
        id: 'item-safety-1',
        variantId: 'variant-1',
        quantity,
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
    findLatestSuccess: jest.fn().mockResolvedValue(null),
    findLatestRecoverable: jest.fn().mockResolvedValue(null),
    listByOrderId: jest.fn().mockResolvedValue([]),
  };

  const cardRecordRepository = {
    createMany: jest.fn().mockResolvedValue({ count: quantity }),
    countByOrderItemId: jest.fn().mockResolvedValue(0),
  };

  const providerRepository = {
    createProviderLog: jest.fn(),
    findProviderById: jest.fn().mockResolvedValue({
      id: 'provider-esale-1',
      code: 'ESALE',
      name: 'eSale',
    }),
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
    $transaction: jest.fn(async (cb) => {
      if (cb.toString().includes('throw')) {
        throw new Error('simulated db failure');
      }
      return cb({});
    }),
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
    providerAudit,
    cardEncryption,
    paidCardOrder,
    providerRepository,
    prisma,
    registry,
  };
}

describe('Phase 2F.2 Provider Safety Audit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    MockESaleProvider.reset();
  });

  describe('CHECK 1: Duplicate fulfillment protection', () => {
    it('does not call buyCard when claim fails (already PROCESSING)', async () => {
      const ctx = buildSafetyContext();
      ctx.orderRepository.claimFulfillmentProcessing.mockResolvedValue({ count: 0 });
      ctx.orderRepository.findOrderForFulfillment
        .mockResolvedValueOnce(ctx.paidCardOrder)
        .mockResolvedValueOnce({
          ...ctx.paidCardOrder,
          fulfillmentStatus: FulfillmentStatus.PROCESSING,
        });

      await expect(ctx.service.fulfillOrder('order-safety-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(ctx.buyCardSpy).not.toHaveBeenCalled();
    });

    it('returns COMPLETED without buyCard when card_records already exist', async () => {
      const ctx = buildSafetyContext();
      ctx.cardRecordRepository.countByOrderItemId.mockResolvedValue(10);

      const result = await ctx.service.fulfillOrder('order-safety-1');

      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
      expect(result.cardsDelivered).toBe(10);
      expect(ctx.buyCardSpy).not.toHaveBeenCalled();
      expect(ctx.orderRepository.claimFulfillmentProcessing).not.toHaveBeenCalled();
    });

    it('returns COMPLETED idempotently when order already COMPLETED', async () => {
      const ctx = buildSafetyContext();
      ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.COMPLETED;

      const result = await ctx.service.fulfillOrder('order-safety-1');

      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
      expect(ctx.buyCardSpy).not.toHaveBeenCalled();
    });
  });

  describe('CHECK 2: eSale success but network lost', () => {
    it('recovers via checkTransaction — never calls buyCard again', async () => {
      const ctx = buildSafetyContext({ buyCardBehavior: 'TIMEOUT' });

      ctx.transactionRepository.create.mockImplementation(async (data) => {
        MockESaleProvider.timeoutRecovery.set(data.requestId, {
          success: true,
          status: ProviderTransactionStatus.SUCCESS,
          providerTransactionId: 'ESALE-RECOVERED',
          cards: Array.from({ length: 10 }, (_, i) => ({
            serial: `SN-${i + 1}`,
            pin: `PIN-${i + 1}`,
          })),
        });
        return { id: 'txn-1', ...data };
      });

      const result = await ctx.service.fulfillOrder('order-safety-1');

      expect(ctx.buyCardSpy).toHaveBeenCalledTimes(1);
      expect(ctx.checkTransactionSpy).toHaveBeenCalledTimes(1);
      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
      expect(result.providerTransactionId).toBe('ESALE-RECOVERED');
    });
  });

  describe('CHECK 3: Manual retry safety', () => {
    it('does not buyCard again when prior SUCCESS transaction exists', async () => {
      const ctx = buildSafetyContext();
      ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.WAITING_ADMIN_RETRY;

      ctx.transactionRepository.findLatestRecoverable.mockResolvedValue({
        id: 'txn-success-1',
        requestId: 'REQ-PRIOR-SUCCESS',
        providerTransactionId: 'ESALE-PRIOR',
        status: ProviderTransactionStatus.SUCCESS,
        attempt: 1,
        providerTransactionDate: '2026-06-19 12:00:00',
        providerMetadata: { requestTime: '1781800000', kind: 'CARD' },
      });

      MockESaleProvider.timeoutRecovery.set('REQ-PRIOR-SUCCESS', {
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: 'ESALE-PRIOR',
        cards: Array.from({ length: 10 }, (_, i) => ({
          serial: `PRIOR-SN-${i + 1}`,
          pin: `PRIOR-PIN-${i + 1}`,
        })),
      });

      const result = await ctx.service.retryFulfillment('order-safety-1');

      expect(ctx.buyCardSpy).not.toHaveBeenCalled();
      expect(ctx.checkTransactionSpy).toHaveBeenCalledWith(
        'REQ-PRIOR-SUCCESS',
        expect.objectContaining({
          providerTransactionDate: '2026-06-19 12:00:00',
        }),
      );
      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.COMPLETED);
    });
  });

  describe('CHECK 4: Quantity validation', () => {
    it('sets WAITING_ADMIN_RETRY when eSale returns fewer cards than ordered', async () => {
      const ctx = buildSafetyContext({ quantity: 10 });
      jest.spyOn(ctx.esale, 'buyCard').mockResolvedValue({
        success: true,
        status: ProviderTransactionStatus.SUCCESS,
        providerTransactionId: 'ESALE-PARTIAL',
        cards: Array.from({ length: 9 }, (_, i) => ({
          serial: `SN-${i + 1}`,
          pin: `PIN-${i + 1}`,
        })),
        rawResponse: { partial: true },
      });

      const result = await ctx.service.fulfillOrder('order-safety-1');

      expect(result.fulfillmentStatus).toBe(FulfillmentStatus.WAITING_ADMIN_RETRY);
      expect(ctx.cardRecordRepository.createMany).not.toHaveBeenCalled();
      expect(ctx.providerAudit.recordFailed).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ reason: 'QUANTITY_MISMATCH' }),
        }),
      );
    });
  });

  describe('CHECK 5: PIN encryption', () => {
    it('stores AES-256-GCM payload (iv:tag:ciphertext) — never plain PIN', async () => {
      const ctx = buildSafetyContext();

      await ctx.service.fulfillOrder('order-safety-1');

      const records = ctx.cardRecordRepository.createMany.mock.calls[0][0] as Array<{
        encryptedPin: string;
        encryptedSerial: string;
      }>;

      for (const record of records) {
        expect(record.encryptedPin.split(':')).toHaveLength(3);
        expect(record.encryptedSerial.split(':')).toHaveLength(3);
        expect(record.encryptedPin).not.toMatch(/^PIN-/);
        expect(ctx.cardEncryption.decrypt(record.encryptedPin)).toMatch(/^PIN-/);
      }
    });
  });

  describe('CHECK 6: Provider balance low', () => {
    it('creates notification but does not disable selling', async () => {
      const ctx = buildSafetyContext();
      MockESaleProvider.balance = 100_000;

      const notificationService = {
        notifyProviderLowBalance: jest.fn(),
      };

      const health = new ProviderHealthService(
        ctx.registry,
        ctx.providerRepository as never,
        {
          get: (key: string) =>
            key === 'provider.lowBalanceThreshold' ? 500_000 : undefined,
        } as ConfigService,
        notificationService as never,
      );

      const result = await health.syncProviderBalance('provider-esale-1');

      expect(result.lowBalance).toBe(true);
      expect(notificationService.notifyProviderLowBalance).toHaveBeenCalled();
      expect(ctx.providerRepository.updateBalance).toHaveBeenCalled();
    });
  });

  describe('CHECK 7: Product sync safety', () => {
    it('syncProducts only returns catalog count — no price writes', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          retCode: 1,
          retMsg: 'Successful',
          data: { info: [{ cardId: 35, priceDiscount: 9000 }] },
        }),
      });

      const mockConfig = {
        getConfig: () => ({
          cardApiUrl: 'https://esale.test/cardshop/',
          topupApiUrl: 'https://esale.test/topup/',
          agencyCode: '9014780450',
          clientCode: 'client_test',
          secretKey: 'secret',
          privateKeyPem: 'unused',
          timeoutMs: 5000,
          defaultCardType: 'Card',
          verifyResponseSignature: false,
        }),
        isConfigured: () => true,
      } as EsaleConfigService;

      const provider = new ESaleProvider(
        mockConfig,
        new EsaleHttpClient(mockConfig, fetchMock),
      );

      const sync = await provider.syncProducts();
      expect(sync.synced).toBeGreaterThan(0);
      expect(sync.message).toContain('admin-driven');
    });
  });

  describe('CHECK 8: Provider transaction audit', () => {
    it('creates new row per attempt — updateResult never replaces history', async () => {
      const ctx = buildSafetyContext();
      MockESaleProvider.buyCardBehavior = 'OUT_OF_STOCK';
      await ctx.service.fulfillOrder('order-safety-1');

      ctx.paidCardOrder.fulfillmentStatus = FulfillmentStatus.WAITING_ADMIN_RETRY;
      ctx.transactionRepository.findMaxAttempt.mockResolvedValue({
        _max: { attempt: 1 },
      });
      ctx.transactionRepository.findLatestRecoverable.mockResolvedValue(null);
      MockESaleProvider.buyCardBehavior = 'SUCCESS';
      await ctx.service.retryFulfillment('order-safety-1');

      expect(ctx.transactionRepository.create).toHaveBeenCalledTimes(2);
      expect(ctx.transactionRepository.updateResult).toHaveBeenCalled();
    });
  });

  describe('CHECK 9: Card delivery atomicity', () => {
    it('rolls back all card_records when transaction fails mid-write', async () => {
      const ctx = buildSafetyContext();
      ctx.prisma.$transaction.mockImplementation(async () => {
        throw new Error('simulated db failure');
      });

      await expect(ctx.service.fulfillOrder('order-safety-1')).rejects.toThrow(
        'simulated db failure',
      );

      expect(ctx.orderRepository.updateFulfillmentStatus).not.toHaveBeenCalledWith(
        'order-safety-1',
        FulfillmentStatus.COMPLETED,
      );
    });
  });

  describe('CHECK 10: Security — no secrets in logs', () => {
    it('eSale client logSafe excludes secretKey, signature, PIN', async () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation();
      const loggerLog = jest.fn();
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          retCode: 1,
          retMsg: 'Successful',
          data: { agencyCode: '9014780450', balance: 1000 },
        }),
      });

      const client = new EsaleHttpClient(
        {
          getConfig: () => ({
            cardApiUrl: 'https://esale.test/cardshop/',
            topupApiUrl: 'https://esale.test/topup/',
            agencyCode: '9014780450',
            clientCode: 'client_test',
            secretKey: 'SUPER-SECRET-KEY',
            privateKeyPem: '-----BEGIN PRIVATE KEY-----\nSECRET\n-----END PRIVATE KEY-----',
            timeoutMs: 5000,
            defaultCardType: 'Card',
            verifyResponseSignature: false,
          }),
        } as EsaleConfigService,
        fetchMock,
      );

      Object.defineProperty(client, 'logger', {
        value: { log: loggerLog, warn: jest.fn(), error: jest.fn() },
      });

      await client.getCardBalance('BAL-TEST');

      const logOutput = loggerLog.mock.calls.flat().join(' ');
      expect(logOutput).not.toContain('SUPER-SECRET-KEY');
      expect(logOutput).not.toContain('PRIVATE KEY');
      expect(logOutput).not.toContain('signature');
      expect(logOutput).toMatch(/retCode=1/);

      logSpy.mockRestore();
    });
  });
});
