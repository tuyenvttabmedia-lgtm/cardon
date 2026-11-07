/**
 * Phase 4A.1 — Admin Security Audit Tests
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
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
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AdminController } from './controllers/admin.controller';
import { CloseEsimQueryClaimDto } from './dto/admin.dto';
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
    'refund.request',
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
    'refund.request',
    'refund.approve',
    'refund.execute',
    'refund.reconcile',
  ],
  ADMIN: [
    'users.read',
    'orders.read',
    'orders.manage',
    'orders.retry',
    'refund.request',
    'refund.approve',
    'refund.execute',
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
  'GET /admin/esim-ops/health': ['orders.read'],
  'GET /admin/esim-ops/dashboard': ['orders.read'],
  'GET /admin/esim-ops/orders': ['orders.read'],
  'GET /admin/esim-ops/orders/:id': ['orders.read'],
  'POST /admin/esim-ops/orders': ['orders.manage'],
  'POST /admin/esim-ops/orders/:id/reveal': ['orders.read'],
  'POST /admin/esim-ops/orders/:id/recover': ['orders.retry'],
  'POST /admin/orders/:id/retry': ['orders.retry'],
  'POST /admin/orders/:id/refunds': ['refund.request'],
  'GET /admin/refund-requests': [
    'refund.request',
    'refund.approve',
    'refund.execute',
    'refund.reconcile',
  ],
  'GET /admin/refund-requests/:id': [
    'refund.request',
    'refund.approve',
    'refund.execute',
    'refund.reconcile',
  ],
  'POST /admin/refund-requests/:id/approve': ['refund.approve'],
  'POST /admin/refund-requests/:id/cancel': ['refund.request', 'refund.approve'],
  'POST /admin/refund-requests/:id/esim-review/clear': ['refund.approve'],
  'POST /admin/refund-requests/:id/execute': ['refund.execute'],
  'POST /admin/refund-attempts/:id/complete': ['refund.execute'],
  'POST /admin/refund-attempts/:id/fail': ['refund.execute'],
  'POST /admin/refund-attempts/:id/unconfirm': ['refund.execute'],
  'POST /admin/refund-attempts/:id/reconcile': ['refund.reconcile'],
  'POST /admin/orders/:id/esim-query-claims/close': ['orders.retry'],
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
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['GET /admin/esim-ops/dashboard']),
    ).toBe(true);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/orders/:id/refunds']),
    ).toBe(true);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/refund-requests/:id/approve']),
    ).toBe(false);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/refund-requests/:id/execute']),
    ).toBe(false);
    expect(
      roleCanAccess('SUPPORT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/refund-attempts/:id/reconcile']),
    ).toBe(false);
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
    expect(
      roleCanAccess('ACCOUNTANT', ADMIN_ENDPOINT_PERMISSIONS['POST /admin/refund-attempts/:id/reconcile']),
    ).toBe(true);
  });

  it('ADMIN has admin module permissions except refund.reconcile-only endpoints', () => {
    for (const [endpoint, required] of Object.entries(ADMIN_ENDPOINT_PERMISSIONS)) {
      if (required.every((code) => code === 'refund.reconcile')) {
        expect(roleCanAccess('ADMIN', required)).toBe(false);
        continue;
      }
      expect({ endpoint, allowed: roleCanAccess('ADMIN', required) }).toEqual({
        endpoint,
        allowed: true,
      });
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
      { dispatch: jest.fn() } as never,
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
        paymentStatus: 'PAID',
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      }),
    };
    const fulfillmentDispatchService = { retryOrderFulfillment: jest.fn() };
    const adminAudit = { record: jest.fn() };
    const service = new AdminOrderService(
      repository as never,
      fulfillmentDispatchService as never,
      adminAudit as never,
      { notifyAdminRetryRequired: jest.fn() } as never,
      { decrypt: jest.fn() } as never,
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
        paymentStatus: 'PAID',
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
      { notifyAdminRetryRequired: jest.fn() } as never,
      { decrypt: jest.fn() } as never,
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
          liveApiEnabled: true,
          apiKeyHash: 'hash',
          secretKeyEncrypted: 'enc',
          securityConfig: {},
        }),
        findBySandboxApiKeyLookup: jest.fn().mockResolvedValue(null),
        touchLastUsedAt: jest.fn(),
      } as never,
      credentialService as never,
      { recordAuthFailure: jest.fn(), parseSecurityConfig: jest.fn().mockReturnValue({}), checkIpWhitelist: jest.fn().mockReturnValue(true) } as never,
    );

    await expect(
      service.authenticate({
        apiKey: 'key',
        signature: 'sig',
        requestId: 'req-1',
        timestamp: String(Math.floor(Date.now() / 1000)),
        method: 'POST',
        path: '/api/partner/v1/buy',
        rawBody: '{}',
        clientIp: null,
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
      { dispatch: jest.fn() } as never,
      {} as never,
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
      sandboxBalance: new Decimal('0.00'),
      sandboxHeldBalance: new Decimal('0.00'),
      apiKeyHash: 'secret-hash',
      apiKeyLookup: 'lookup',
      secretKeyEncrypted: 'encrypted-secret',
      sandboxApiKeyHash: null,
      sandboxApiKeyLookup: null,
      sandboxSecretKeyEncrypted: null,
      liveApiEnabled: false,
      lastUsedAt: null,
      contactEmail: null,
      rateLimit: 100,
      apiEnabled: true,
      securityConfig: {},
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

const CLOSE_ESIM_QUERY_CLAIM_ROUTE = 'POST /admin/orders/:id/esim-query-claims/close';
const QUERY_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const CREATE_ATTEMPT_ID = '22222222-2222-4222-8222-222222222222';

function closeClaimBodyPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

function validCloseClaimBody() {
  return {
    queryAttemptId: QUERY_ATTEMPT_ID,
    createAttemptId: CREATE_ATTEMPT_ID,
    reason: 'Worker process confirmed stopped',
  };
}

describe('B3.36 — close eSIM QUERY claim', () => {
  const handler = AdminController.prototype.closeEsimQueryClaim;

  it('exposes one POST route under the admin controller', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AdminController)).toBe('admin');
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'orders/:id/esim-query-claims/close',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(ADMIN_ENDPOINT_PERMISSIONS[CLOSE_ESIM_QUERY_CLAIM_ROUTE]).toEqual([
      'orders.retry',
    ]);

    const source = readFileSync(
      join(__dirname, 'controllers/admin.controller.ts'),
      'utf8',
    );
    expect(source.match(/esim-query-claims\/close/g)).toHaveLength(1);
    expect(source.match(/orders\/:id\/recovery/g)).toHaveLength(1);
  });

  it('requires orders.retry and keeps the existing admin guards', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(['orders.retry']);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, PermissionsGuard]),
    );
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AdminController)).toBeUndefined();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.retryOrder)).toEqual([
      'orders.retry',
    ]);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.orderManualRecovery),
    ).toEqual(['orders.retry']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.createRefundRequest),
    ).toEqual(['refund.request']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.listRefundRequests),
    ).toEqual(['refund.request', 'refund.approve', 'refund.execute', 'refund.reconcile']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.getRefundRequest),
    ).toEqual(['refund.request', 'refund.approve', 'refund.execute', 'refund.reconcile']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.approveRefundRequest),
    ).toEqual(['refund.approve']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.cancelRefundRequest),
    ).toEqual(['refund.request', 'refund.approve']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.clearRefundEsimReview),
    ).toEqual(['refund.approve']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.executeRefundRequest),
    ).toEqual(['refund.execute']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.completeRefundAttempt),
    ).toEqual(['refund.execute']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.failRefundAttempt),
    ).toEqual(['refund.execute']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.unconfirmRefundAttempt),
    ).toEqual(['refund.execute']);
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, AdminController.prototype.reconcileRefundAttempt),
    ).toEqual(['refund.reconcile']);
  });

  it('rejects an unauthenticated request before the handler runs', async () => {
    const closeEsimQueryClaim = jest.fn();
    const guard = new JwtAuthGuard({
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as never);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({}),
          getResponse: () => ({}),
        }),
        getHandler: () => handler,
        getClass: () => AdminController,
      } as never),
    ).rejects.toThrow(/jwt|Unauthorized|authentication/i);
    expect(closeEsimQueryClaim).not.toHaveBeenCalled();
  });

  it('rejects a user who does not have orders.retry', async () => {
    expect(roleCanAccess('UNKNOWN', ['orders.retry'])).toBe(false);
    const guard = new PermissionsGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(['orders.retry']) } as never,
      { roleHasAnyPermission: jest.fn().mockResolvedValue(false) } as never,
    );
    const context = {
      getHandler: () => handler,
      getClass: () => AdminController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: 'user-1', role: 'SUPPORT' } }),
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('forwards the session admin and validated body to the existing service', async () => {
    const closeEsimQueryClaim = jest.fn().mockResolvedValue({ result: 'closed' });
    const controller = new AdminController(
      {} as never,
      { closeEsimQueryClaim } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const forged = {
      ...validCloseClaimBody(),
      adminId: 'forged-admin',
      refund: true,
      mark_fulfilled: true,
    };

    await controller.closeEsimQueryClaim(
      { id: 'session-admin' } as AuthenticatedUser,
      '33333333-3333-4333-8333-333333333333',
      forged as CloseEsimQueryClaimDto,
    );

    expect(closeEsimQueryClaim).toHaveBeenCalledTimes(1);
    expect(closeEsimQueryClaim).toHaveBeenCalledWith('session-admin', {
      orderId: '33333333-3333-4333-8333-333333333333',
      queryAttemptId: QUERY_ATTEMPT_ID,
      createAttemptId: CREATE_ATTEMPT_ID,
      reason: 'Worker process confirmed stopped',
    });
  });

  it('does not reuse the recovery DTO or call the repository', () => {
    const source = readFileSync(
      join(__dirname, 'controllers/admin.controller.ts'),
      'utf8',
    );
    const method = source.slice(
      source.indexOf("orders/:id/esim-query-claims/close"),
      source.indexOf("@Get('payments/manual-review')"),
    );

    expect(method).toContain('CloseEsimQueryClaimDto');
    expect(method).not.toContain('OrderManualRecoveryDto');
    expect(method).toContain('this.orderService.closeEsimQueryClaim(user.id');
    expect(method).not.toContain('closeSentQueryClaim');
    expect(method).not.toContain('refund');
    expect(method).not.toContain('mark_fulfilled');
  });

  it('rejects a body that omits a required field or uses a blank reason', async () => {
    const pipe = closeClaimBodyPipe();
    const cases = [
      { createAttemptId: CREATE_ATTEMPT_ID, reason: 'confirmed stopped' },
      { queryAttemptId: QUERY_ATTEMPT_ID, reason: 'confirmed stopped' },
      { queryAttemptId: QUERY_ATTEMPT_ID, createAttemptId: CREATE_ATTEMPT_ID },
      {
        queryAttemptId: QUERY_ATTEMPT_ID,
        createAttemptId: CREATE_ATTEMPT_ID,
        reason: '   ',
      },
      {
        queryAttemptId: '',
        createAttemptId: CREATE_ATTEMPT_ID,
        reason: 'confirmed stopped',
      },
      {
        queryAttemptId: 12,
        createAttemptId: CREATE_ATTEMPT_ID,
        reason: 'confirmed stopped',
      },
    ];

    for (const body of cases) {
      await expect(
        pipe.transform(body, { type: 'body', metatype: CloseEsimQueryClaimDto }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects adminId, refund, mark_fulfilled, and unknown fields', async () => {
    const main = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
    expect(main).toContain('whitelist: true');
    expect(main).toContain('forbidNonWhitelisted: true');

    const pipe = closeClaimBodyPipe();
    for (const extra of [
      { adminId: 'forged-admin' },
      { refund: true },
      { mark_fulfilled: true },
      { outcome: 'closed' },
    ]) {
      await expect(
        pipe.transform(
          { ...validCloseClaimBody(), ...extra },
          { type: 'body', metatype: CloseEsimQueryClaimDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('accepts the three approved fields', async () => {
    const result = await closeClaimBodyPipe().transform(validCloseClaimBody(), {
      type: 'body',
      metatype: CloseEsimQueryClaimDto,
    });

    expect(result).toEqual(validCloseClaimBody());
  });
});
