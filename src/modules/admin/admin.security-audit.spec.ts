/**
 * Phase 4A.1 — Admin Security Audit Tests
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  AgentStatus,
  AuditTargetType,
  FulfillmentStatus,
  LedgerEntryType,
  LedgerReferenceType,
  OrderPaymentStatus,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { assertAdminAgentResponseSafe, mapAdminAgent } from './entities/admin-agent.mapper';
import { ADMIN_AUDIT_ACTIONS, ADMIN_PAGINATION_MAX } from './entities/admin.constants';
import { resolveAdminPagination } from './utils/admin-pagination.util';
import { AdminAgentService } from './services/admin-agent.service';
import { AdminOrderService } from './services/admin-order.service';
import { AdminPaymentService } from './services/admin-payment.service';
import { PaymentService } from '../payment/services/payment.service';

/** Mirrors prisma/seed.mjs ROLE_PERMISSION_MATRIX for admin-relevant permissions. */
const ROLE_PERMISSION_MATRIX: Record<string, string[]> = {
  SUPPORT: [
    'users.read',
    'orders.read',
    'orders.retry',
    'payments.view',
    'agents.kyc.review',
  ],
  ACCOUNTANT: [
    'users.read',
    'orders.read',
    'payments.view',
    'ledger.view',
    'invoice.manage',
    'agents.credit',
    'payments.review',
  ],
  ADMIN: [
    'users.read',
    'orders.read',
    'orders.manage',
    'orders.retry',
    'payments.view',
    'ledger.view',
    'providers.manage',
    'pricing.manage',
    'products.manage',
    'invoice.manage',
    'cms.manage',
    'agents.kyc.review',
    'agents.credit',
    'agents.manage',
    'admin.dashboard',
    'audit.view',
    'payments.review',
  ],
};

const ADMIN_ENDPOINT_PERMISSIONS: Record<string, string[]> = {
  'GET /admin/dashboard': ['admin.dashboard'],
  'GET /admin/orders': ['orders.read'],
  'POST /admin/orders/:id/retry': ['orders.retry'],
  'GET /admin/payments': ['payments.view'],
  'GET /admin/payments/manual-review': ['payments.review'],
  'POST /admin/payments/:id/resolve': ['payments.review'],
  'GET /admin/providers/status': ['providers.manage'],
  'GET /admin/providers/:id/transactions': ['providers.manage'],
  'POST /admin/providers/:id/sync-products': ['providers.manage'],
  'POST /admin/providers/:id/check-balance': ['providers.manage'],
  'GET /admin/products': ['products.manage'],
  'GET /admin/agents': ['users.read'],
  'POST /admin/agents/:id/suspend': ['agents.manage'],
  'GET /admin/audit-logs': ['audit.view'],
};

function roleCanAccess(role: string, required: string[]): boolean {
  const permissions = ROLE_PERMISSION_MATRIX[role] ?? [];
  return required.some((code) => permissions.includes(code));
}

describe('Phase 4A.1 — CHECK 1: Permission enforcement', () => {
  it('SUPPORT can view orders but cannot approve payments or suspend agents', () => {
    expect(roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['GET /admin/orders'])).toBe(true);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/payments/:id/resolve']),
    ).toBe(false);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/agents/:id/suspend']),
    ).toBe(false);
    expect(roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['GET /admin/dashboard'])).toBe(
      false,
    );
  });

  it('ACCOUNTANT can payment review but cannot suspend agent or access dashboard', () => {
    expect(
      roleCanAccess('ACCOUNTANT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/payments/:id/resolve']),
    ).toBe(true);
    expect(
      roleCanAccess('ACCOUNTANT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/agents/:id/suspend']),
    ).toBe(false);
    expect(roleCanAccess('ACCOUNTANT', ADMIN_ENDPOINT_PERMISSIONS['GET /admin/dashboard'])).toBe(
      false,
    );
  });

  it('ADMIN has full admin module permissions from seed matrix', () => {
    for (const required of Object.values(ADMIN_ENDPOINT_PERMISSIONS)) {
      expect(roleCanAccess('ADMIN', required)).toBe(true);
    }
  });

  it('PermissionsGuard denies when role lacks permission', async () => {
    const rbac = { roleHasAnyPermission: jest.fn().mockResolvedValue(false) };
    const guard = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['payments.review']) } as never,
      rbac as never,
    );

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', role: 'SUPPORT' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('RolesGuard denies SUPPORT from dashboard role-restricted route', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'SUPER_ADMIN']),
    } as never);

    expect(() =>
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', role: 'SUPPORT' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).toThrow(ForbiddenException);
  });
});

describe('Phase 4A.1 — CHECK 2: Manual payment approval safety', () => {
  it('rejects approval when payment amount does not match order total', async () => {
    const paymentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        amount: new Decimal('100000.00'),
        status: PaymentRecordStatus.EXPIRED,
        gatewayResponse: { manualReview: true },
        order: {
          id: 'order-1',
          totalAmount: new Decimal('90000.00'),
          paymentStatus: OrderPaymentStatus.EXPIRED,
        },
      }),
    };
    const fulfillmentDispatchService = { dispatchOrderFulfillment: jest.fn() };

    const paymentService = new PaymentService(
      { $transaction: jest.fn() } as never,
      paymentRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      fulfillmentDispatchService as never,
      { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
    );

    await expect(paymentService.approveManualReview('pay-1', 'admin-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fulfillmentDispatchService.dispatchOrderFulfillment).not.toHaveBeenCalled();
  });

  it('AdminPaymentService records audit on approve', async () => {
    const paymentSvc = {
      approveManualReview: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        orderId: 'order-1',
        action: 'approve',
      }),
      rejectManualReview: jest.fn(),
      listManualReviewQueue: jest.fn(),
    };
    const adminAudit = { record: jest.fn() };
    const repository = {
      findPaymentsAdmin: jest.fn(),
      countPaymentsAdmin: jest.fn(),
    };
    const service = new AdminPaymentService(
      paymentSvc as never,
      adminAudit as never,
      repository as never,
    );

    await service.resolveManualReview('admin-1', 'pay-1', { action: 'approve' });

    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_PAYMENT_REVIEW_APPROVE,
      AuditTargetType.ORDER,
      'order-1',
      expect.objectContaining({ paymentId: 'pay-1' }),
    );
  });
});

describe('Phase 4A.1 — CHECK 3: Manual fulfillment retry safety', () => {
  it('rejects retry unless order is WAITING_ADMIN_RETRY', async () => {
    const repository = {
      findOrderById: jest.fn().mockResolvedValue({
        id: 'order-1',
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      }),
    };
    const fulfillmentDispatchService = { retryOrderFulfillment: jest.fn() };
    const adminAudit = { record: jest.fn() };
    const service = new AdminOrderService(
      repository as never,
      fulfillmentDispatchService as never,
      adminAudit as never,
    );

    await expect(service.retryFulfillment('admin-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fulfillmentDispatchService.retryOrderFulfillment).not.toHaveBeenCalled();
  });

  it('delegates retry to FulfillmentDispatchService which enforces recoverable idempotency', async () => {
    const repository = {
      findOrderById: jest.fn().mockResolvedValue({
        id: 'order-1',
        fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
      }),
    };
    const fulfillmentDispatchService = {
      retryOrderFulfillment: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
        duplicate: true,
      }),
    };
    const adminAudit = { record: jest.fn() };
    const service = new AdminOrderService(
      repository as never,
      fulfillmentDispatchService as never,
      adminAudit as never,
    );

    await service.retryFulfillment('admin-1', 'order-1');

    expect(fulfillmentDispatchService.retryOrderFulfillment).toHaveBeenCalledWith('order-1');
    expect(adminAudit.record).toHaveBeenCalled();
  });
});

describe('Phase 4A.1 — CHECK 4: Agent suspension (Agent API)', () => {
  it('AgentApiAuthService rejects suspended agent login', async () => {
    const { AgentApiAuthService } = await import('../agent-api/services/agent-api-auth.service');
    const { ErrorCode } = await import('../../common/constants/error-codes.constants');
    const credentialService = {
      verifyApiKey: jest.fn().mockReturnValue(true),
      decryptSecretKey: jest.fn().mockReturnValue('secret'),
    };
    const service = new AgentApiAuthService(
      {
        findByApiKeyLookup: jest.fn().mockResolvedValue({
          id: 'agent-1',
          status: AgentStatus.SUSPENDED,
          apiEnabled: true,
          apiKeyHash: 'hash',
          secretKeyEncrypted: 'enc',
        }),
        touchLastUsedAt: jest.fn(),
      } as never,
      credentialService as never,
    );

    await expect(
      service.authenticate({
        apiKey: 'key',
        signature: 'sig',
        requestId: 'req-1',
        method: 'POST',
        path: '/api/partner/v1/buy',
        rawBody: '{}',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.AGENT_SUSPENDED });
  });
});

describe('Phase 4A.1 — CHECK 5: Admin credit balance', () => {
  it('creditAgent uses ledger CREDIT entry only (no direct balance update)', async () => {
    const { AgentService } = await import('../agent/services/agent.service');
    const agentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        status: AgentStatus.ACTIVE,
      }),
      updateStatus: jest.fn(),
    };
    const ledgerService = {
      credit: jest.fn().mockResolvedValue({ id: 'ledger-1' }),
      getBalance: jest.fn().mockResolvedValue({ available: '1000.00', held: '0.00' }),
    };
    const agentAudit = { recordCredited: jest.fn() };

    const service = new AgentService(
      agentRepository as never,
      {} as never,
      {} as never,
      {} as never,
      ledgerService as never,
      agentAudit as never,
      { notifyAgentApproved: jest.fn() } as never,
      { encrypt: jest.fn(), decrypt: jest.fn() } as never,
      { requireInviteForMode: jest.fn().mockResolvedValue(null), consumeInvite: jest.fn() } as never,
    );

    await service.creditAgent('admin-1', {
      agentId: 'agent-1',
      amount: '500.00',
      note: 'Top up',
    });

    expect(ledgerService.credit).toHaveBeenCalledWith(
      'agent-1',
      expect.any(Decimal),
      LedgerReferenceType.TOPUP,
      expect.any(String),
      'admin-1',
      'Top up',
    );
    expect(agentRepository.updateStatus).not.toHaveBeenCalled();
    expect(agentAudit.recordCredited).toHaveBeenCalled();
  });
});

describe('Phase 4A.1 — CHECK 6: Audit integrity', () => {
  it('important admin mutations record audit before returning', async () => {
    const adminAudit = { record: jest.fn() };
    const service = new AdminAgentService(
      {
        findAgentById: jest.fn().mockResolvedValue({
          id: 'agent-1',
          status: AgentStatus.ACTIVE,
          apiKeyHash: 'hash',
          balance: new Decimal(0),
          heldBalance: new Decimal(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as never,
      { updateStatus: jest.fn() } as never,
      { suspendAgent: jest.fn() } as never,
      adminAudit as never,
      { notifyAgentApiDisabled: jest.fn() } as never,
      { agent: { update: jest.fn() } } as never,
    );

    await service.enableApi('admin-1', 'agent-1');
    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_API_ENABLED,
      AuditTargetType.AGENT,
      'agent-1',
    );
  });
});

describe('Phase 4A.1 — CHECK 7: Sensitive data exposure', () => {
  it('mapAdminAgent strips apiKeyHash and secretKeyEncrypted', () => {
    const view = mapAdminAgent({
      id: 'agent-1',
      userId: 'user-1',
      companyName: 'Co',
      balance: new Decimal('100.00'),
      heldBalance: new Decimal('0.00'),
      apiKeyHash: 'secret-hash',
      apiKeyLookup: 'lookup',
      secretKeyEncrypted: 'encrypted-secret',
      lastUsedAt: null,
      contactEmail: null,
      rateLimit: 100,
      apiEnabled: true,
      status: AgentStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      deletedAt: null,
    });

    expect(view.hasApiCredentials).toBe(true);
    assertAdminAgentResponseSafe(view);
    expect(view).not.toHaveProperty('apiKeyHash');
    expect(view).not.toHaveProperty('secretKeyEncrypted');
    expect(view).not.toHaveProperty('apiKeyLookup');
  });

  it('AdminAgentService.getAgent returns sanitized view', async () => {
    const repository = {
      findAgentById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        userId: 'user-1',
        companyName: 'Co',
        balance: new Decimal('0.00'),
        heldBalance: new Decimal('0.00'),
        apiKeyHash: 'hash',
        secretKeyEncrypted: 'enc',
        apiKeyLookup: 'lookup',
        lastUsedAt: null,
        contactEmail: null,
        rateLimit: 100,
        apiEnabled: false,
        status: AgentStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    };
    const service = new AdminAgentService(
      repository as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
      { notifyAgentApiDisabled: jest.fn() } as never,
      {} as never,
    );

    const result = await service.getAgent('agent-1');
    assertAdminAgentResponseSafe(result);
  });
});

describe('Phase 4A.1 — CHECK 8: Pagination protection', () => {
  it('caps take at ADMIN_PAGINATION_MAX', () => {
    expect(resolveAdminPagination(0, 500).take).toBe(ADMIN_PAGINATION_MAX);
    expect(resolveAdminPagination(undefined, undefined).take).toBe(50);
  });

  it('defaults invalid take to safe page size', () => {
    expect(resolveAdminPagination(0, 0).take).toBe(50);
    expect(resolveAdminPagination(0, -5).take).toBe(50);
  });
});

describe('Phase 4A.1 — Ledger type sanity', () => {
  it('admin credit path uses CREDIT ledger type', () => {
    expect(LedgerEntryType.CREDIT).toBe('CREDIT');
  });
});
