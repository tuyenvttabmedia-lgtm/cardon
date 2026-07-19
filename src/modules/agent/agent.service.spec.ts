/**
 * Phase 3A — Agent Platform Core Tests
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentKycStatus,
  AgentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AgentService } from './services/agent.service';
import { LedgerService } from './services/ledger.service';
import { AgentCredentialService } from './services/agent-credential.service';
import { LedgerRepository } from './repositories/ledger.repository';
import { AGENT_API_KEY_PREFIX, AGENT_SECRET_KEY_PREFIX } from './entities/agent.constants';

describe('AgentService (Phase 3A)', () => {
  let service: AgentService;
  let agentRepository: {
    findByUserId: jest.Mock;
    findById: jest.Mock;
    create: jest.Mock;
    updateStatus: jest.Mock;
    saveApiCredentials: jest.Mock;
  };
  let kycRepository: { upsertSubmitted: jest.Mock; approve: jest.Mock; reject: jest.Mock; requestMoreInfo: jest.Mock };
  let userRepository: {
    assertCanReviewKyc: jest.Mock;
    promoteToAgent: jest.Mock;
    ensureOwnerMember: jest.Mock;
  };
  let credentialService: AgentCredentialService;
  let ledgerService: {
    credit: jest.Mock;
    getBalance: jest.Mock;
    getHistory: jest.Mock;
  };
  let agentAudit: {
    recordRegistered: jest.Mock;
    recordKycSubmitted: jest.Mock;
    recordKycApproved: jest.Mock;
    recordKycRejected: jest.Mock;
    recordCredited: jest.Mock;
    recordSuspended: jest.Mock;
    recordApiKeyGenerated: jest.Mock;
  };

  const userId = 'user-agent-1';
  const adminId = 'admin-1';
  const agentId = 'agent-1';

  const baseAgent = {
    id: agentId,
    userId,
    companyName: 'Test Co',
    status: AgentStatus.PENDING_KYC,
    contactEmail: 'agent@test.com',
    apiEnabled: false,
    balance: new Decimal(0),
    heldBalance: new Decimal(0),
    createdAt: new Date(),
    kyc: null as {
      status: AgentKycStatus;
    } | null,
  };

  const kycDto = {
    accountType: 'COMPANY' as const,
    profile: {
      companyName: 'Test Co Ltd',
      taxCode: '0123456789',
      representative: 'Nguyen Van A',
    },
    documents: {
      citizenId: 'https://cdn/doc-front.jpg',
      businessRegistration: 'https://cdn/license.pdf',
    },
    businessProfile: {
      interests: ['GAME_CARD'],
      expectedVolume: '100-500',
      hasExistingSystem: false,
      programmingLanguages: ['PHP'],
      acceptTerms: true,
      acceptPrivacy: true,
      acceptLegalCommitment: true,
    },
  };

  beforeEach(() => {
    agentRepository = {
      findByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      saveApiCredentials: jest.fn(),
    };
    kycRepository = {
      upsertSubmitted: jest.fn(),
      approve: jest.fn(),
      reject: jest.fn(),
      requestMoreInfo: jest.fn(),
    };
    userRepository = {
      assertCanReviewKyc: jest.fn(),
      promoteToAgent: jest.fn(),
      ensureOwnerMember: jest.fn(),
    };
    credentialService = {
      generateCredentials: jest.fn().mockReturnValue({
        apiKey: `${AGENT_API_KEY_PREFIX}abc123`,
        secretKey: `${AGENT_SECRET_KEY_PREFIX}secret456`,
        apiKeyHash: 'hash-api',
        apiKeyLookup: 'lookup-api',
        secretKeyEncrypted: 'enc-secret',
      }),
    } as unknown as AgentCredentialService;
    ledgerService = {
      credit: jest.fn(),
      getBalance: jest.fn().mockResolvedValue({
        balance: '1000000.00',
        heldBalance: '0.00',
        availableBalance: '1000000.00',
        currency: 'VND',
      }),
      getHistory: jest.fn(),
    };
    agentAudit = {
      recordRegistered: jest.fn(),
      recordKycSubmitted: jest.fn(),
      recordKycApproved: jest.fn(),
      recordKycRejected: jest.fn(),
      recordCredited: jest.fn(),
      recordSuspended: jest.fn(),
      recordApiKeyGenerated: jest.fn(),
    };

    service = new AgentService(
      agentRepository as never,
      kycRepository as never,
      userRepository as never,
      credentialService,
      ledgerService as never,
      agentAudit as never,
      { notifyAgentApproved: jest.fn(), notifyAgentKycRejected: jest.fn(), notifyAgentKycNeedMoreInfo: jest.fn(), notifyAgentLowBalance: jest.fn(), notifyAgentApiDisabled: jest.fn() } as never,
      { encrypt: jest.fn(), decrypt: jest.fn() } as never,
      { requireInviteForMode: jest.fn().mockResolvedValue(null), consumeInvite: jest.fn() } as never,
      { dispatch: jest.fn() } as never,
      { saveDocument: jest.fn(), resolveFilePath: jest.fn() } as never,
    );
  });

  it('creates agent profile with PENDING_KYC', async () => {
    agentRepository.findByUserId.mockResolvedValue(null);
    agentRepository.create.mockResolvedValue({
      ...baseAgent,
      id: agentId,
    });

    const result = await service.registerAgent(userId, {
      companyName: 'Test Co',
      contactEmail: 'agent@test.com',
    });

    expect(result.status).toBe(AgentStatus.PENDING_KYC);
    expect(agentRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, companyName: 'Test Co' }),
    );
    expect(agentAudit.recordRegistered).toHaveBeenCalledWith(userId, agentId);
  });

  it('submits KYC for pending agent', async () => {
    agentRepository.findByUserId.mockResolvedValue({ ...baseAgent, kyc: null });

    const result = await service.submitKyc(userId, kycDto);

    expect(kycRepository.upsertSubmitted).toHaveBeenCalledWith(
      agentId,
      expect.objectContaining({
        accountType: 'COMPANY',
        companyName: 'Test Co Ltd',
      }),
    );
    expect(agentAudit.recordKycSubmitted).toHaveBeenCalledWith(userId, agentId);
    expect(result.kycStatus).toBe(AgentKycStatus.SUBMITTED);
  });

  it('approves KYC and returns API credentials once', async () => {
    agentRepository.findById.mockResolvedValue({
      ...baseAgent,
      kyc: { status: AgentKycStatus.SUBMITTED },
    });

    const result = await service.approveKyc(adminId, agentId, UserRole.ADMIN);

    expect(kycRepository.approve).toHaveBeenCalledWith(agentId, adminId);
    expect(agentRepository.updateStatus).toHaveBeenCalledWith(
      agentId,
      AgentStatus.ACTIVE,
    );
    expect(agentRepository.saveApiCredentials).toHaveBeenCalledWith(
      agentId,
      expect.objectContaining({
        apiKeyHash: 'hash-api',
        apiKeyLookup: 'lookup-api',
        secretKeyEncrypted: 'enc-secret',
        apiEnabled: true,
      }),
    );
    expect(userRepository.promoteToAgent).toHaveBeenCalledWith(userId);
    expect(result.apiKey).toContain(AGENT_API_KEY_PREFIX);
    expect(result.secretKey).toContain(AGENT_SECRET_KEY_PREFIX);
    expect(agentAudit.recordKycApproved).toHaveBeenCalled();
    expect(agentAudit.recordApiKeyGenerated).toHaveBeenCalled();
  });

  it('rejects non-admin/support from KYC review', async () => {
    await expect(
      service.approveKyc(adminId, agentId, UserRole.CUSTOMER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents agent from approving own KYC', async () => {
    agentRepository.findById.mockResolvedValue({
      ...baseAgent,
      kyc: { status: AgentKycStatus.SUBMITTED },
    });
    userRepository.assertCanReviewKyc.mockImplementation(() => {
      throw new ForbiddenException('Agents cannot review their own KYC');
    });

    await expect(
      service.approveKyc(userId, agentId, UserRole.ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('credits active agent via ledger', async () => {
    agentRepository.findById.mockResolvedValue({
      ...baseAgent,
      status: AgentStatus.ACTIVE,
    });
    ledgerService.credit.mockResolvedValue({ id: 'ledger-1' });

    const result = await service.creditAgent(adminId, {
      agentId,
      amount: '500000',
      note: 'Bank transfer verified',
    });

    expect(ledgerService.credit).toHaveBeenCalledWith(
      agentId,
      expect.any(Decimal),
      LedgerReferenceType.TOPUP,
      expect.any(String),
      adminId,
      'Bank transfer verified',
    );
    expect(agentAudit.recordCredited).toHaveBeenCalled();
    expect(result.amount).toBe('500000.00');
    expect(result.balance.availableBalance).toBe('1000000.00');
  });

  it('rejects credit for non-active agent', async () => {
    agentRepository.findById.mockResolvedValue(baseAgent);

    await expect(
      service.creditAgent(adminId, { agentId, amount: '1000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suspends agent and disables API', async () => {
    agentRepository.findById.mockResolvedValue({
      ...baseAgent,
      status: AgentStatus.ACTIVE,
      apiEnabled: true,
    });

    const result = await service.suspendAgent(adminId, agentId, 'Fraud review');

    expect(agentRepository.updateStatus).toHaveBeenCalledWith(
      agentId,
      AgentStatus.SUSPENDED,
      { apiEnabled: false },
    );
    expect(agentAudit.recordSuspended).toHaveBeenCalledWith(
      adminId,
      agentId,
      'Fraud review',
    );
    expect(result.status).toBe(AgentStatus.SUSPENDED);
  });

  it('rejects duplicate agent registration', async () => {
    agentRepository.findByUserId.mockResolvedValue(baseAgent);

    await expect(
      service.registerAgent(userId, { companyName: 'Dup' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('LedgerRepository immutability', () => {
  it('forbids update and delete on ledger entries', () => {
    const repo = new LedgerRepository({} as never);

    expect(() => repo.updateEntry()).toThrow(ForbiddenException);
    expect(() => repo.deleteEntry()).toThrow(ForbiddenException);
  });
});

describe('LedgerService balance', () => {
  let ledgerService: LedgerService;
  let prisma: { $transaction: jest.Mock };
  let agentRepository: {
    findById: jest.Mock;
    lockForUpdate: jest.Mock;
    findByIdInTransaction: jest.Mock;
    updateBalancesInTransaction: jest.Mock;
  };
  let ledgerRepository: { createEntry: jest.Mock };

  const agentId = 'agent-1';

  beforeEach(() => {
    agentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: agentId,
        balance: new Decimal(1000000),
        heldBalance: new Decimal(200000),
      }),
      lockForUpdate: jest.fn(),
      findByIdInTransaction: jest.fn(),
      updateBalancesInTransaction: jest.fn(),
    };
    ledgerRepository = {
      createEntry: jest.fn().mockResolvedValue({ id: 'entry-1' }),
    };
    prisma = {
      $transaction: jest.fn(async (cb) => cb({})),
    };

    ledgerService = new LedgerService(
      prisma as never,
      agentRepository as never,
      ledgerRepository as never,
      { notifyAgentLowBalance: jest.fn() } as never,
      { get: () => 100_000 } as never,
    );
  });

  it('calculates available = balance - held', async () => {
    const snapshot = await ledgerService.getBalance(agentId);

    expect(snapshot.balance).toBe('1000000.00');
    expect(snapshot.heldBalance).toBe('200000.00');
    expect(snapshot.availableBalance).toBe('800000.00');
  });

  it('creates CREDIT ledger entry and updates balance in transaction', async () => {
    agentRepository.findByIdInTransaction.mockResolvedValue({
      id: agentId,
      balance: new Decimal(0),
      heldBalance: new Decimal(0),
    });

    await ledgerService.credit(
      agentId,
      new Decimal(500000),
      LedgerReferenceType.TOPUP,
      'ref-uuid',
      'admin-1',
    );

    expect(agentRepository.lockForUpdate).toHaveBeenCalled();
    expect(ledgerRepository.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LedgerEntryType.CREDIT,
        amount: expect.any(Decimal),
        afterBalance: expect.any(Decimal),
      }),
      expect.anything(),
    );
    expect(agentRepository.updateBalancesInTransaction).toHaveBeenCalled();
  });
});

describe('AgentCredentialService', () => {
  it('generates api key and encrypted secret', () => {
    const config = {
      get: jest.fn().mockReturnValue('test-encryption-key-32chars-min!!'),
    };
    const svc = new AgentCredentialService(config as never);
    const creds = svc.generateCredentials();

    expect(creds.apiKey).toMatch(/^ak_/);
    expect(creds.secretKey).toMatch(/^sk_/);
    expect(creds.apiKeyHash).toBeTruthy();
    expect(creds.secretKeyEncrypted).toContain(':');
    expect(svc.verifyApiKey(creds.apiKey, creds.apiKeyHash)).toBe(true);
    expect(svc.decryptSecretKey(creds.secretKeyEncrypted)).toBe(creds.secretKey);
  });
});
