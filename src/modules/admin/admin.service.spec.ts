/**
 * Phase 4A — Admin Operation Core Tests
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AgentStatus,
  AuditTargetType,
  FulfillmentStatus,
  OrderPaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { AdminAgentService } from './services/admin-agent.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminOrderService } from './services/admin-order.service';
import { AdminPaymentService } from './services/admin-payment.service';
import { ADMIN_AUDIT_ACTIONS } from './entities/admin.constants';

describe('AdminDashboardService', () => {
  it('returns dashboard metrics', async () => {
    const repository = {
      getDashboardStats: jest.fn().mockResolvedValue({
        todayRevenue: '500000.00',
        ordersCount: 12,
        successfulPayments: 10,
        failedPayments: 2,
        pendingFulfillment: 3,
        providerErrors: 1,
        agentStatistics: { total: 5, active: 3, pendingKyc: 1, suspended: 0, rejected: 1 },
        currency: 'VND',
        asOf: '2026-06-19T00:00:00.000Z',
      }),
    };
    const service = new AdminDashboardService(repository as never);
    const result = await service.getDashboard();
    expect(result.todayRevenue).toBe('500000.00');
    expect(result.ordersCount).toBe(12);
  });
});

describe('AdminOrderService', () => {
  let service: AdminOrderService;
  let repository: {
    findOrderById: jest.Mock;
    findOrdersAdmin: jest.Mock;
  };
  let fulfillmentDispatchService: { retryOrderFulfillment: jest.Mock };
  let adminAudit: { record: jest.Mock };

  beforeEach(() => {
    repository = {
      findOrderById: jest.fn(),
      findOrdersAdmin: jest.fn().mockResolvedValue([]),
    };
    fulfillmentDispatchService = {
      retryOrderFulfillment: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        fulfillmentStatus: FulfillmentStatus.COMPLETED,
      }),
    };
    adminAudit = { record: jest.fn() };
    service = new AdminOrderService(
      repository as never,
      fulfillmentDispatchService as never,
      adminAudit as never,
    );
  });

  it('retries fulfillment only for WAITING_ADMIN_RETRY', async () => {
    repository.findOrderById.mockResolvedValue({
      id: 'order-1',
      fulfillmentStatus: FulfillmentStatus.WAITING_ADMIN_RETRY,
    });

    await service.retryFulfillment('admin-1', 'order-1');

    expect(fulfillmentDispatchService.retryOrderFulfillment).toHaveBeenCalledWith('order-1');
    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_PROVIDER_RETRY,
      AuditTargetType.ORDER,
      'order-1',
      expect.any(Object),
    );
  });

  it('rejects retry for non-retryable status', async () => {
    repository.findOrderById.mockResolvedValue({
      id: 'order-1',
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
    });

    await expect(service.retryFulfillment('admin-1', 'order-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fulfillmentDispatchService.retryOrderFulfillment).not.toHaveBeenCalled();
  });
});

describe('AdminPaymentService', () => {
  it('approves manual review and records audit', async () => {
    const paymentService = {
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
      paymentService as never,
      adminAudit as never,
      repository as never,
    );

    await service.resolveManualReview('admin-1', 'pay-1', { action: 'approve' });

    expect(paymentService.approveManualReview).toHaveBeenCalledWith('pay-1', 'admin-1');
    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_PAYMENT_REVIEW_APPROVE,
      AuditTargetType.ORDER,
      'order-1',
      expect.objectContaining({ paymentId: 'pay-1' }),
    );
  });

  it('rejects manual review and records audit', async () => {
    const paymentService = {
      rejectManualReview: jest.fn().mockResolvedValue({
        paymentId: 'pay-1',
        orderId: 'order-1',
        action: 'reject',
      }),
      approveManualReview: jest.fn(),
      listManualReviewQueue: jest.fn(),
    };
    const adminAudit = { record: jest.fn() };
    const repository = {
      findPaymentsAdmin: jest.fn(),
      countPaymentsAdmin: jest.fn(),
    };
    const service = new AdminPaymentService(
      paymentService as never,
      adminAudit as never,
      repository as never,
    );

    await service.resolveManualReview('admin-1', 'pay-1', {
      action: 'reject',
      reason: 'Duplicate transfer',
    });

    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_PAYMENT_REVIEW_REJECT,
      AuditTargetType.ORDER,
      'order-1',
      expect.objectContaining({ reason: 'Duplicate transfer' }),
    );
  });
});

describe('AdminAgentService', () => {
  it('suspends agent via AgentService', async () => {
    const agentService = {
      suspendAgent: jest.fn().mockResolvedValue({ agentId: 'agent-1', status: AgentStatus.SUSPENDED }),
    };
    const service = new AdminAgentService(
      { findAgentById: jest.fn() } as never,
      { updateStatus: jest.fn() } as never,
      agentService as never,
      { record: jest.fn() } as never,
      {} as never,
      { order: { count: jest.fn() }, ledgerEntry: { count: jest.fn() }, agent: { update: jest.fn() } } as never,
    );

    const result = await service.suspendAgent('admin-1', 'agent-1', { reason: 'Fraud' });
    expect(agentService.suspendAgent).toHaveBeenCalledWith('admin-1', 'agent-1', 'Fraud');
    expect(result.status).toBe(AgentStatus.SUSPENDED);
  });

  it('enables API for active agent with credentials', async () => {
    const repository = {
      findAgentById: jest.fn().mockResolvedValue({
        id: 'agent-1',
        status: AgentStatus.ACTIVE,
        apiKeyHash: 'hash',
      }),
    };
    const agentRepository = { updateStatus: jest.fn() };
    const adminAudit = { record: jest.fn() };
    const service = new AdminAgentService(
      repository as never,
      agentRepository as never,
      { suspendAgent: jest.fn() } as never,
      adminAudit as never,
      {} as never,
      { order: { count: jest.fn() }, ledgerEntry: { count: jest.fn() }, agent: { update: jest.fn() } } as never,
    );

    const result = await service.enableApi('admin-1', 'agent-1');
    expect(result.apiEnabled).toBe(true);
    expect(adminAudit.record).toHaveBeenCalledWith(
      'admin-1',
      ADMIN_AUDIT_ACTIONS.ADMIN_AGENT_API_ENABLED,
      AuditTargetType.AGENT,
      'agent-1',
    );
  });
});

describe('Admin permission enforcement (unit)', () => {
  it('permission denied when role lacks required permission', async () => {
    const rbac = {
      roleHasAnyPermission: jest.fn().mockResolvedValue(false),
    };
    const guard = new (await import('../auth/guards/permissions.guard')).PermissionsGuard(
      {
        getAllAndOverride: jest.fn().mockReturnValue(['admin.dashboard']),
      } as never,
      rbac as never,
    );

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'u1', role: 'CUSTOMER' } }),
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
