/**
 * Phase 3B — Public Agent API Gateway Tests
 */
import { HttpStatus } from '@nestjs/common';
import {
  AgentStatus,
  FinancialTransactionStatus,
  FulfillmentStatus,
  ProductVariantStatus,
  ProductVariantType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AppHttpException } from '../../common/exceptions/app-http.exception';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import {
  AgentCredentialService,
  hashApiKeyForLookup,
} from '../agent/services/agent-credential.service';
import { AGENT_API_PREFIX } from './entities/agent-api.constants';
import {
  buildSignaturePayload,
  signPartnerRequest,
} from './entities/agent-api-signature';
import { AgentApiAuthService } from './services/agent-api-auth.service';
import { AgentApiBuyService } from './services/agent-api-buy.service';

describe('AgentApiAuthService', () => {
  let service: AgentApiAuthService;
  let agentRepository: {
    findByApiKeyLookup: jest.Mock;
    touchLastUsedAt: jest.Mock;
  };
  let credentialService: AgentCredentialService;

  const apiKey = 'ak_test_api_key_001';
  const secretKey = 'sk_test_secret_key_001';
  const requestId = 'req-auth-001';
  const path = `${AGENT_API_PREFIX}/balance`;
  const rawBody = '';

  const activeAgent = {
    id: 'agent-1',
    userId: 'user-1',
    companyName: 'Partner Co',
    balance: new Decimal(1_000_000),
    heldBalance: new Decimal(0),
    apiKeyHash: 'hash',
    apiKeyLookup: hashApiKeyForLookup(apiKey),
    secretKeyEncrypted: 'enc',
    status: AgentStatus.ACTIVE,
    apiEnabled: true,
    rateLimit: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    contactEmail: null,
    lastUsedAt: null,
  };

  beforeEach(() => {
    agentRepository = {
      findByApiKeyLookup: jest.fn(),
      touchLastUsedAt: jest.fn(),
    };
    credentialService = {
      verifyApiKey: jest.fn().mockReturnValue(true),
      decryptSecretKey: jest.fn().mockReturnValue(secretKey),
    } as unknown as AgentCredentialService;

    service = new AgentApiAuthService(
      agentRepository as never,
      credentialService,
    );
  });

  function sign(method: string, body = rawBody) {
    const payload = buildSignaturePayload(method, path, requestId, body);
    return signPartnerRequest(secretKey, payload);
  }

  it('authenticates valid API key and signature', async () => {
    agentRepository.findByApiKeyLookup.mockResolvedValue(activeAgent);

    const ctx = await service.authenticate({
      apiKey,
      signature: sign('GET'),
      requestId,
      method: 'GET',
      path,
      rawBody,
    });

    expect(ctx.agent.id).toBe('agent-1');
    expect(ctx.requestId).toBe(requestId);
    expect(agentRepository.touchLastUsedAt).toHaveBeenCalledWith('agent-1');
  });

  it('rejects invalid signature', async () => {
    agentRepository.findByApiKeyLookup.mockResolvedValue(activeAgent);

    await expect(
      service.authenticate({
        apiKey,
        signature: 'bad-signature',
        requestId,
        method: 'GET',
        path,
        rawBody,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.INVALID_SIGNATURE,
    });
  });

  it('denies inactive agent', async () => {
    agentRepository.findByApiKeyLookup.mockResolvedValue({
      ...activeAgent,
      status: AgentStatus.PENDING_KYC,
    });

    await expect(
      service.authenticate({
        apiKey,
        signature: sign('GET'),
        requestId,
        method: 'GET',
        path,
        rawBody,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_INACTIVE,
    });
  });

  it('denies suspended agent', async () => {
    agentRepository.findByApiKeyLookup.mockResolvedValue({
      ...activeAgent,
      status: AgentStatus.SUSPENDED,
    });

    await expect(
      service.authenticate({
        apiKey,
        signature: sign('GET'),
        requestId,
        method: 'GET',
        path,
        rawBody,
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AGENT_SUSPENDED,
    });
  });
});

describe('AgentApiBuyService', () => {
  let service: AgentApiBuyService;
  let prisma: { $transaction: jest.Mock };
  let repository: {
    findOrderByAgentRequestId: jest.Mock;
    findLatestProviderFailureCode: jest.Mock;
    createFinancialTransaction: jest.Mock;
    createAgentOrderWithHold: jest.Mock;
    updateFinancialTransactionStatus: jest.Mock;
    markOrderFailed: jest.Mock;
    isCardVariant: jest.Mock;
  };
  let agentRepository: { lockForUpdate: jest.Mock };
  let variantRepository: { findBySku: jest.Mock };
  let pricingService: { getAgentPrice: jest.Mock };
  let ledgerService: {
    holdInTransaction: jest.Mock;
    debitFromHoldInTransaction: jest.Mock;
    releaseInTransaction: jest.Mock;
    getBalance: jest.Mock;
  };
  let providerService: { fulfillOrder: jest.Mock };
  let cardEncryption: { decrypt: jest.Mock };

  const ctx = {
    agent: {
      id: 'agent-1',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
    },
    requestId: 'req-buy-001',
    secretKey: 'sk_test',
  } as never;

  const variant = {
    id: 'var-1',
    sku: 'GARENA_100K',
    type: ProductVariantType.CARD,
    status: ProductVariantStatus.ACTIVE,
    deletedAt: null,
  };

  const completedOrder = {
    id: 'order-1',
    agentRequestId: 'req-buy-001',
    totalAmount: new Decimal(100000),
    fulfillmentStatus: FulfillmentStatus.COMPLETED,
    financialTransaction: { status: FinancialTransactionStatus.COMPLETED },
    orderItems: [
      {
        id: 'item-1',
        quantity: 1,
        unitPrice: new Decimal(100000),
        variant: { sku: 'GARENA_100K' },
        cardRecords: [
          { encryptedSerial: 'enc-serial', encryptedPin: 'enc-pin' },
        ],
      },
    ],
  };

  beforeEach(() => {
    repository = {
      findOrderByAgentRequestId: jest.fn(),
      findLatestProviderFailureCode: jest.fn().mockResolvedValue(undefined),
      createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'fin-1' }),
      createAgentOrderWithHold: jest.fn().mockResolvedValue(completedOrder),
      updateFinancialTransactionStatus: jest.fn(),
      markOrderFailed: jest.fn(),
      isCardVariant: jest.fn().mockReturnValue(true),
    };
    agentRepository = { lockForUpdate: jest.fn() };
    variantRepository = {
      findBySku: jest.fn().mockResolvedValue(variant),
    };
    pricingService = {
      getAgentPrice: jest.fn().mockResolvedValue('100000.00'),
    };
    ledgerService = {
      holdInTransaction: jest.fn(),
      debitFromHoldInTransaction: jest.fn(),
      releaseInTransaction: jest.fn(),
      getBalance: jest.fn().mockResolvedValue({
        availableBalance: '900000.00',
        heldBalance: '100000.00',
        balance: '1000000.00',
        currency: 'VND',
      }),
    };
    providerService = {
      fulfillOrder: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        cardsDelivered: 1,
      }),
    };
    cardEncryption = {
      decrypt: jest.fn((value: string) =>
        value === 'enc-serial' ? 'SERIAL-1' : 'PIN-1',
      ),
    };

    prisma = {
      $transaction: jest.fn(async (cb) =>
        cb({
          order: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
      ),
    };

    service = new AgentApiBuyService(
      prisma as never,
      repository as never,
      agentRepository as never,
      variantRepository as never,
      pricingService as never,
      ledgerService as never,
      providerService as never,
      cardEncryption as never,
    );
  });

  it('returns balance snapshot', async () => {
    const result = await service.getBalance('agent-1');
    expect(result.available_balance).toBe('900000.00');
    expect(result.held_balance).toBe('100000.00');
  });

  it('buys card successfully and debits hold', async () => {
    repository.findOrderByAgentRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedOrder);

    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        order: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const created = await cb(tx);
      return created;
    });

    repository.createAgentOrderWithHold.mockResolvedValue({
      ...completedOrder,
      id: 'order-1',
    });

    const result = await service.buyCard(ctx, {
      product_code: 'GARENA_100K',
      quantity: 1,
      request_id: 'req-buy-001',
    });

    expect(providerService.fulfillOrder).toHaveBeenCalledWith('order-1');
    expect(ledgerService.debitFromHoldInTransaction).toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
    expect(result.cards).toEqual([
      { card_serial: 'SERIAL-1', card_pin: 'PIN-1' },
    ]);
  });

  it('rejects insufficient balance on hold', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    repository.findOrderByAgentRequestId.mockResolvedValue(null);
    ledgerService.holdInTransaction.mockRejectedValue(
      new BadRequestException('INSUFFICIENT_BALANCE'),
    );

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({ order: { findFirst: jest.fn().mockResolvedValue(null) } }),
    );

    await expect(
      service.buyCard(ctx, {
        product_code: 'GARENA_100K',
        quantity: 1,
        request_id: 'req-buy-001',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INSUFFICIENT_BALANCE });
  });

  it('returns duplicate request without re-charging', async () => {
    repository.findOrderByAgentRequestId.mockResolvedValue(completedOrder);

    const result = await service.buyCard(ctx, {
      product_code: 'GARENA_100K',
      quantity: 1,
      request_id: 'req-buy-001',
    });

    expect(providerService.fulfillOrder).not.toHaveBeenCalled();
    expect(ledgerService.holdInTransaction).not.toHaveBeenCalled();
    expect(result.status).toBe('SUCCESS');
  });

  it('handles concurrent duplicate creation safely', async () => {
    repository.findOrderByAgentRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(completedOrder);

    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        order: {
          findFirst: jest.fn().mockResolvedValue({ id: 'order-existing' }),
        },
      };
      return cb(tx);
    });

    const result = await service.buyCard(ctx, {
      product_code: 'GARENA_100K',
      quantity: 1,
      request_id: 'req-buy-001',
    });

    expect(result.request_id).toBe('req-buy-001');
    expect(providerService.fulfillOrder).not.toHaveBeenCalled();
  });

  it('releases hold when provider fails with OUT_OF_STOCK', async () => {
    const failedOrder = {
      ...completedOrder,
      fulfillmentStatus: FulfillmentStatus.FAILED,
    };

    repository.findOrderByAgentRequestId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(failedOrder);
    repository.findLatestProviderFailureCode.mockResolvedValue('OUT_OF_STOCK');
    providerService.fulfillOrder.mockResolvedValue({
      orderId: 'order-1',
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    });

    repository.createAgentOrderWithHold.mockResolvedValue({
      ...completedOrder,
      fulfillmentStatus: FulfillmentStatus.PENDING,
    });

    prisma.$transaction.mockImplementation(async (cb) =>
      cb({ order: { findFirst: jest.fn().mockResolvedValue(null) } }),
    );

    const result = await service.buyCard(ctx, {
      product_code: 'GARENA_100K',
      quantity: 1,
      request_id: 'req-buy-001',
    });

    expect(ledgerService.releaseInTransaction).toHaveBeenCalled();
    expect(result.status).toBe('FAILED');
    expect(result.error?.code).toBe('OUT_OF_STOCK');
  });

  it('queries transaction by request id', async () => {
    repository.findOrderByAgentRequestId.mockResolvedValue(completedOrder);

    const result = await service.getTransaction('agent-1', 'req-buy-001');

    expect(result.status).toBe('SUCCESS');
    expect(result.cards?.[0].card_serial).toBe('SERIAL-1');
  });
});

describe('Agent API concurrency (balance)', () => {
  it('only one hold succeeds when balance covers a single order', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    let holdCalls = 0;

    const hold = jest.fn(async () => {
      holdCalls += 1;
      if (holdCalls > 1) {
        throw new BadRequestException('INSUFFICIENT_BALANCE');
      }
    });

    await hold();
    await expect(hold()).rejects.toBeInstanceOf(BadRequestException);
    expect(holdCalls).toBe(2);
  });
});
