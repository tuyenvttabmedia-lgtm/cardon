/**
 * Phase 3B.1 — Agent Money Safety Audit
 */
import { ExecutionContext, HttpStatus } from '@nestjs/common';
import {
  AgentStatus,
  FinancialTransactionStatus,
  FulfillmentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  ProductVariantStatus,
  ProductVariantType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ErrorCode } from '../../common/constants/error-codes.constants';
import {
  AgentCredentialService,
  hashApiKeyForLookup,
} from '../agent/services/agent-credential.service';
import { LedgerRepository } from '../agent/repositories/ledger.repository';
import { LedgerService } from '../agent/services/ledger.service';
import { AGENT_API_PREFIX } from './entities/agent-api.constants';
import {
  buildSignaturePayload,
  signPartnerRequest,
} from './entities/agent-api-signature';
import {
  AgentApiRateLimitGuard,
  AGENT_API_CONTEXT_KEY,
} from './guards/agent-api-auth.guard';
import { AgentApiAuthService } from './services/agent-api-auth.service';
import { AgentApiBuyService } from './services/agent-api-buy.service';

const TEST_AMOUNT = new Decimal(100_000);

function buildInMemoryLedger(initialBalance = TEST_AMOUNT) {
  const state = {
    balance: initialBalance,
    heldBalance: new Decimal(0),
  };
  const entries: Array<{ type: LedgerEntryType; amount: Decimal }> = [];

  let chain: Promise<unknown> = Promise.resolve();
  const prisma = {
    $transaction: jest.fn((cb: (tx: object) => Promise<unknown>) => {
      chain = chain.then(() => cb({}));
      return chain;
    }),
  };

  const agentRepository = {
    lockForUpdate: jest.fn(),
    findByIdInTransaction: jest.fn(async () => ({
      id: 'agent-1',
      balance: state.balance,
      heldBalance: state.heldBalance,
    })),
    updateBalancesInTransaction: jest.fn(
      async (_id: string, data: { balance: Decimal; heldBalance: Decimal }) => {
        state.balance = data.balance;
        state.heldBalance = data.heldBalance;
      },
    ),
    findById: jest.fn(async () => ({
      id: 'agent-1',
      balance: state.balance,
      heldBalance: state.heldBalance,
    })),
  };

  const ledgerRepository = {
    createEntry: jest.fn(async (data: { type: LedgerEntryType; amount: Decimal }) => {
      entries.push({ type: data.type, amount: data.amount });
      return { id: `entry-${entries.length}` };
    }),
    listByAgentId: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn(),
  };

  const ledgerService = new LedgerService(
    prisma as never,
    agentRepository as never,
    ledgerRepository as never,
    { notifyAgentLowBalance: jest.fn() } as never,
    { get: () => 100_000 } as never,
  );

  return { ledgerService, state, entries, prisma };
}

describe('Phase 3B.1 Agent Money Safety Audit', () => {
  describe('CHECK 1: Concurrent balance spending', () => {
    it('allows only one HOLD when 10 parallel requests each need full balance', async () => {
      const { ledgerService, state, entries } = buildInMemoryLedger(TEST_AMOUNT);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          ledgerService.hold(
            'agent-1',
            TEST_AMOUNT,
            LedgerReferenceType.TRANSACTION,
            `ref-${i}`,
          ),
        ),
      );

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      expect(state.balance.toNumber()).toBe(100_000);
      expect(state.heldBalance.toNumber()).toBe(100_000);
      expect(state.balance.sub(state.heldBalance).toNumber()).toBeGreaterThanOrEqual(0);
      expect(entries.filter((e) => e.type === LedgerEntryType.HOLD)).toHaveLength(1);
    });
  });

  describe('CHECK 2: Duplicate request replay', () => {
    let buyService: AgentApiBuyService;
    let providerService: { fulfillOrder: jest.Mock };
    let ledgerService: {
      holdInTransaction: jest.Mock;
      debitFromHoldInTransaction: jest.Mock;
      releaseInTransaction: jest.Mock;
    };
    let repository: {
      findOrderByAgentRequestId: jest.Mock;
      findLatestProviderFailureCode: jest.Mock;
      createFinancialTransaction: jest.Mock;
      createAgentOrderWithHold: jest.Mock;
      updateFinancialTransactionStatus: jest.Mock;
    };

    const completedOrder = {
      id: 'order-dup',
      agentId: 'agent-1',
      agentRequestId: 'req-dup-001',
      totalAmount: TEST_AMOUNT,
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
      financialTransaction: {
        id: 'fin-1',
        status: FinancialTransactionStatus.COMPLETED,
      },
      orderItems: [
        {
          quantity: 1,
          unitPrice: TEST_AMOUNT,
          variant: { sku: 'GARENA_100K' },
          cardRecords: [],
        },
      ],
    };

    beforeEach(() => {
      providerService = { fulfillOrder: jest.fn() };
      ledgerService = {
        holdInTransaction: jest.fn(),
        debitFromHoldInTransaction: jest.fn(),
        releaseInTransaction: jest.fn(),
      };
      repository = {
        findOrderByAgentRequestId: jest.fn().mockResolvedValue(completedOrder),
        findLatestProviderFailureCode: jest.fn().mockResolvedValue(undefined),
        createFinancialTransaction: jest.fn(),
        createAgentOrderWithHold: jest.fn(),
        updateFinancialTransactionStatus: jest.fn(),
      };

      buyService = new AgentApiBuyService(
        { $transaction: jest.fn() } as never,
        repository as never,
        { lockForUpdate: jest.fn() } as never,
        { findBySku: jest.fn() } as never,
        { getAgentPrice: jest.fn() } as never,
        ledgerService as never,
        providerService as never,
        { decrypt: jest.fn() } as never,
      );
    });

    it('returns same result without new provider or hold on replay', async () => {
      const ctx = {
        agent: { id: 'agent-1' },
        requestId: 'req-dup-001',
      } as never;

      const first = await buyService.buyCard(ctx, {
        product_code: 'GARENA_100K',
        quantity: 1,
        request_id: 'req-dup-001',
      });
      const second = await buyService.buyCard(ctx, {
        product_code: 'GARENA_100K',
        quantity: 1,
        request_id: 'req-dup-001',
      });

      expect(first.request_id).toBe(second.request_id);
      expect(first.status).toBe(second.status);
      expect(providerService.fulfillOrder).not.toHaveBeenCalled();
      expect(ledgerService.holdInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('CHECK 3: Provider success + ledger failure recovery', () => {
    it('retries DEBIT on idempotent replay when settlement was missed', async () => {
      const orderWithPendingSettlement = {
        id: 'order-settle',
        agentId: 'agent-1',
        agentRequestId: 'req-settle-001',
        totalAmount: TEST_AMOUNT,
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        financialTransaction: {
          id: 'fin-hold',
          status: FinancialTransactionStatus.HOLD,
        },
        orderItems: [
          {
            quantity: 1,
            unitPrice: TEST_AMOUNT,
            variant: { sku: 'GARENA_100K' },
            cardRecords: [{ encryptedSerial: 's', encryptedPin: 'p' }],
          },
        ],
      };

      const settledOrder = {
        ...orderWithPendingSettlement,
        financialTransaction: {
          id: 'fin-hold',
          status: FinancialTransactionStatus.COMPLETED,
        },
      };

      const repository = {
        findOrderByAgentRequestId: jest
          .fn()
          .mockResolvedValueOnce(orderWithPendingSettlement)
          .mockResolvedValueOnce(settledOrder),
        findLatestProviderFailureCode: jest.fn().mockResolvedValue(undefined),
        updateFinancialTransactionStatus: jest.fn(),
      };

      const ledgerService = {
        debitFromHoldInTransaction: jest.fn(),
        releaseInTransaction: jest.fn(),
      };

      const prisma = {
        $transaction: jest.fn(async (cb) => cb({})),
      };

      const buyService = new AgentApiBuyService(
        prisma as never,
        repository as never,
        {} as never,
        {} as never,
        {} as never,
        ledgerService as never,
        { fulfillOrder: jest.fn() } as never,
        { decrypt: jest.fn((v: string) => v) } as never,
      );

      await buyService.buyCard(
        { agent: { id: 'agent-1' }, requestId: 'req-settle-001' } as never,
        {
          product_code: 'GARENA_100K',
          quantity: 1,
          request_id: 'req-settle-001',
        },
      );

      expect(ledgerService.debitFromHoldInTransaction).toHaveBeenCalled();
      expect(repository.updateFinancialTransactionStatus).toHaveBeenCalledWith(
        'fin-hold',
        FinancialTransactionStatus.COMPLETED,
        expect.anything(),
      );
    });
  });

  describe('CHECK 4: Provider timeout keeps HOLD', () => {
    it('does not RELEASE on TIMEOUT — status PROCESSING', async () => {
      const { buyService, ledger } = buildBuyServiceForFailure('TIMEOUT');
      const result = await buyService.buyCard(
        { agent: { id: 'agent-1' }, requestId: 'req-timeout' } as never,
        {
          product_code: 'GARENA_100K',
          quantity: 1,
          request_id: 'req-timeout',
        },
      );

      expect(ledger.releaseInTransaction).not.toHaveBeenCalled();
      expect(result.status).toBe('PROCESSING');
    });
  });

  describe('CHECK 5: Provider final failure releases HOLD', () => {
    it.each(['OUT_OF_STOCK', 'LOW_BALANCE'] as const)(
      'RELEASE hold on %s',
      async (failureCode) => {
        const { buyService, ledger } = buildBuyServiceForFailure(failureCode);
        const result = await buyService.buyCard(
          { agent: { id: 'agent-1' }, requestId: `req-${failureCode}` } as never,
          {
            product_code: 'GARENA_100K',
            quantity: 1,
            request_id: `req-${failureCode}`,
          },
        );

        expect(ledger.releaseInTransaction).toHaveBeenCalled();
        expect(result.status).toBe('FAILED');
      },
    );
  });

  describe('CHECK 6: Ledger correctness', () => {
    it('CREDIT increases balance without affecting held', async () => {
      const { ledgerService, state } = buildInMemoryLedger(new Decimal(0));
      await ledgerService.credit(
        'agent-1',
        TEST_AMOUNT,
        LedgerReferenceType.TOPUP,
        'topup-1',
      );
      expect(state.balance.toNumber()).toBe(100_000);
      expect(state.heldBalance.toNumber()).toBe(0);
    });

    it('HOLD → DEBIT completes purchase without direct balance mutation', async () => {
      const { ledgerService, state, entries } = buildInMemoryLedger(TEST_AMOUNT);
      await ledgerService.hold(
        'agent-1',
        TEST_AMOUNT,
        LedgerReferenceType.TRANSACTION,
        'txn-1',
      );
      await ledgerService.debitFromHold(
        'agent-1',
        TEST_AMOUNT,
        LedgerReferenceType.ORDER,
        'order-1',
      );
      expect(state.balance.toNumber()).toBe(0);
      expect(state.heldBalance.toNumber()).toBe(0);
      expect(entries.map((e) => e.type)).toEqual([
        LedgerEntryType.HOLD,
        LedgerEntryType.DEBIT,
      ]);
    });

    it('HOLD → RELEASE restores available balance', async () => {
      const { ledgerService, state } = buildInMemoryLedger(TEST_AMOUNT);
      await ledgerService.hold(
        'agent-1',
        TEST_AMOUNT,
        LedgerReferenceType.TRANSACTION,
        'txn-1',
      );
      await ledgerService.release(
        'agent-1',
        TEST_AMOUNT,
        LedgerReferenceType.ORDER,
        'order-1',
      );
      expect(state.balance.toNumber()).toBe(100_000);
      expect(state.heldBalance.toNumber()).toBe(0);
    });

    it('LedgerRepository forbids direct mutation', () => {
      const repo = new LedgerRepository({} as never);
      expect(() => repo.updateEntry()).toThrow();
      expect(() => repo.deleteEntry()).toThrow();
    });
  });

  describe('CHECK 7: API security', () => {
    const apiKey = 'ak_audit_key';
    const secretKey = 'sk_audit_secret';
    const requestId = 'req-security';
    const path = `${AGENT_API_PREFIX}/balance`;

    function authService(agent: Record<string, unknown>) {
      return new AgentApiAuthService(
        {
          findByApiKeyLookup: jest.fn().mockResolvedValue(agent),
          touchLastUsedAt: jest.fn(),
        } as never,
        {
          verifyApiKey: jest.fn().mockReturnValue(true),
          decryptSecretKey: jest.fn().mockReturnValue(secretKey),
        } as unknown as AgentCredentialService,
      );
    }

    const baseAgent = {
      id: 'agent-1',
      apiKeyHash: 'hash',
      apiKeyLookup: hashApiKeyForLookup(apiKey),
      secretKeyEncrypted: 'enc',
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
    };

    it('rejects invalid signature', async () => {
      const service = authService(baseAgent);
      await expect(
        service.authenticate({
          apiKey,
          signature: 'invalid',
          requestId,
          method: 'GET',
          path,
          rawBody: '',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.INVALID_SIGNATURE });
    });

    it('rejects disabled API key', async () => {
      const service = authService({ ...baseAgent, apiEnabled: false });
      await expect(
        service.authenticate({
          apiKey,
          signature: signPartnerRequest(
            secretKey,
            buildSignaturePayload('GET', path, requestId, ''),
          ),
          requestId,
          method: 'GET',
          path,
          rawBody: '',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.AGENT_INACTIVE });
    });

    it('rejects suspended agent', async () => {
      const service = authService({
        ...baseAgent,
        status: AgentStatus.SUSPENDED,
      });
      await expect(
        service.authenticate({
          apiKey,
          signature: signPartnerRequest(
            secretKey,
            buildSignaturePayload('GET', path, requestId, ''),
          ),
          requestId,
          method: 'GET',
          path,
          rawBody: '',
        }),
      ).rejects.toMatchObject({ code: ErrorCode.AGENT_SUSPENDED });
    });
  });

  describe('CHECK 8: Rate limit', () => {
    it('enforces per-agent limit', () => {
      const guard = new AgentApiRateLimitGuard();
      const ctx = {
        agent: { id: 'agent-rate', rateLimit: 2 },
        requestId: 'r1',
        secretKey: 'sk',
      };

      const request = {} as Record<string, unknown>;
      request[AGENT_API_CONTEXT_KEY] = ctx;

      const executionContext = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as ExecutionContext;

      expect(guard.canActivate(executionContext)).toBe(true);
      expect(guard.canActivate(executionContext)).toBe(true);

      expect(() => guard.canActivate(executionContext)).toThrow(
        expect.objectContaining({ code: ErrorCode.RATE_LIMITED }),
      );
    });
  });

  describe('CHECK 9: Card ownership', () => {
    it('Agent B cannot query Agent A transaction', async () => {
      const repository = {
        findOrderByAgentRequestId: jest.fn().mockResolvedValue(null),
        findLatestProviderFailureCode: jest.fn(),
      };

      const buyService = new AgentApiBuyService(
        {} as never,
        repository as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await expect(
        buyService.getTransaction('agent-B', 'agent-A-request'),
      ).rejects.toThrow('Transaction not found');

      expect(repository.findOrderByAgentRequestId).toHaveBeenCalledWith(
        'agent-B',
        'agent-A-request',
      );
    });
  });
});

function buildBuyServiceForFailure(failureCode: string) {
  const ledger = {
    holdInTransaction: jest.fn(),
    debitFromHoldInTransaction: jest.fn(),
    releaseInTransaction: jest.fn(),
  };

  const pendingOrder = {
    id: 'order-fail',
    agentId: 'agent-1',
    agentRequestId: `req-${failureCode}`,
    totalAmount: TEST_AMOUNT,
    fulfillmentStatus: FulfillmentStatus.PENDING,
    financialTransaction: { id: 'fin-1', status: FinancialTransactionStatus.HOLD },
    orderItems: [
      {
        quantity: 1,
        unitPrice: TEST_AMOUNT,
        variant: { sku: 'GARENA_100K' },
        cardRecords: [],
      },
    ],
  };

  const failedOrder = {
    ...pendingOrder,
    fulfillmentStatus: FulfillmentStatus.FAILED,
  };

  const repository = {
    findOrderByAgentRequestId: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValue(failedOrder),
    findLatestProviderFailureCode: jest.fn().mockResolvedValue(failureCode),
    createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'fin-1' }),
    createAgentOrderWithHold: jest.fn().mockResolvedValue(pendingOrder),
    updateFinancialTransactionStatus: jest.fn(),
    markOrderFailed: jest.fn(),
    isCardVariant: jest.fn().mockReturnValue(true),
  };

  const variant = {
    id: 'var-1',
    sku: 'GARENA_100K',
    type: ProductVariantType.CARD,
    status: ProductVariantStatus.ACTIVE,
    deletedAt: null,
  };

  const buyService = new AgentApiBuyService(
    {
      $transaction: jest.fn(async (cb) =>
        cb({ order: { findFirst: jest.fn().mockResolvedValue(null) } }),
      ),
    } as never,
    repository as never,
    { lockForUpdate: jest.fn() } as never,
    { findBySku: jest.fn().mockResolvedValue(variant) } as never,
    { getAgentPrice: jest.fn().mockResolvedValue('100000.00') } as never,
    ledger as never,
    {
      fulfillOrder: jest.fn().mockResolvedValue({
        orderId: 'order-fail',
        fulfillmentStatus:
          failureCode === 'TIMEOUT'
            ? FulfillmentStatus.WAITING_ADMIN_RETRY
            : FulfillmentStatus.WAITING_ADMIN_RETRY,
      }),
    } as never,
    { decrypt: jest.fn() } as never,
  );

  return { buyService, ledger };
}
