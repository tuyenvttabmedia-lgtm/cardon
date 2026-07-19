/**
 * Phase 5C.8 — Operation & Account Completion Tests
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AgentRegistrationMode, AuditTargetType, UserRole, UserStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import * as bcrypt from 'bcryptjs';
import { mapAdminOrderDetail } from './entities/admin-order-detail.mapper';
import { AdminCustomerService } from './services/admin-customer.service';
import { AdminSearchService } from './services/admin-search.service';
import { AdminStaffService } from './services/admin-staff.service';
import { AgentInviteService } from '../agent/services/agent-invite.service';
import { AccountService } from '../auth/services/account.service';

describe('Phase 5C.8 — Admin order detail mapper', () => {
  it('maps overview, payment trace, provider trace, cards masked, audit', () => {
    const detail = mapAdminOrderDetail({
      order: {
        id: 'order-1',
        orderCode: 'ORD-001',
        channel: 'WEB',
        isGuestOrder: false,
        guestEmail: null,
        guestPhone: null,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: null,
        totalAmount: new Decimal('100000'),
        paymentStatus: 'PAID',
        fulfillmentStatus: 'COMPLETED',
        paymentExpiresAt: null,
        createdAt: new Date('2026-01-01'),
        userId: 'user-1',
        user: { id: 'user-1', email: 'c@test.com', phone: '0912345678', username: 'cust', fullName: 'Cust' },
        orderItems: [{
          id: 'item-1', orderId: 'order-1', variantId: 'v1', quantity: 1,
          unitPrice: new Decimal('100000'), discount: new Decimal(0), totalAmount: new Decimal('100000'),
          status: 'COMPLETED', createdAt: new Date(), variant: { sku: 'SKU', name: 'Card' },
          cardRecords: [{ id: 'card-1', orderItemId: 'item-1', encryptedSerial: 'enc-s', encryptedPin: 'enc-p', providerResponse: {}, status: 'DELIVERED', pinViewCount: 0, pinFirstViewedAt: null, firstViewedAt: null, viewCount: 0, createdAt: new Date() }],
        }],
        payments: [{
          id: 'pay-1', orderId: 'order-1', gateway: 'MEGAPAY', paymentReference: 'PAY-REF',
          idempotencyKey: null, amount: new Decimal('100000'), status: 'SUCCESS',
          gatewayResponse: { gatewayTransactionId: 'GW-TX-1' }, paidAt: new Date(), expiresAt: null,
          createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
        }],
        providerTransactions: [{
          id: 'ptx-1', orderId: 'order-1', providerId: 'prov-1', providerTransactionId: 'PTX-1',
          providerReference: 'REF-1', requestId: 'REQ-1', providerTransactionDate: null,
          providerMetadata: { cost: '95000' }, attempt: 1, action: 'BUY_CARD', status: 'SUCCESS',
          requestPayload: {}, responsePayload: { ok: true }, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
          provider: { code: 'ESALE', name: 'eSale' },
        }],
        providerLogs: [],
      } as never,
      auditLogs: [{ id: 'a1', action: 'ORDER_CREATED', targetType: AuditTargetType.ORDER, targetId: 'order-1', metadata: {}, createdAt: new Date(), adminId: 'u1', ipAddress: null, admin: { email: 'admin@test.com', role: UserRole.ADMIN } }],
      canViewPin: false,
      decryptSerial: () => 'SERIAL123',
      decryptPin: () => '1234',
    });

    expect(detail.overview.orderCode).toBe('ORD-001');
    expect(detail.paymentTrace[0].gatewayTransactionId).toBe('GW-TX-1');
    expect(detail.providerTrace[0].cost).toBe('95000.00');
    expect(detail.cardDelivery.cards[0].pinMasked).toBe('************');
    expect(detail.cardDelivery.cards[0].serial).toBe('SERIAL123');
    expect(detail.auditTimeline).toHaveLength(1);
  });
});

describe('Phase 5C.8 — Global search', () => {
  it('returns grouped search results', async () => {
    const repository = {
      globalSearch: jest.fn().mockResolvedValue([
        [{ id: 'o1', orderCode: 'ORD-1', paymentStatus: 'PAID', fulfillmentStatus: 'COMPLETED' }],
        [{ id: 'u1', email: 'c@test.com', username: 'c', role: 'CUSTOMER', status: 'ACTIVE' }],
        [{ id: 'p1', paymentReference: 'PAY-1', gateway: 'MEGAPAY', orderId: 'o1', status: 'SUCCESS' }],
        [{ id: 'pt1', orderId: 'o1', requestId: 'REQ-1', providerTransactionId: 'PTX-1', status: 'SUCCESS' }],
      ]),
    };
    const service = new AdminSearchService(repository as never);
    const result = await service.search('ORD-1', [
      'orders.read',
      'customers.read',
      'payments.view',
      'providers.manage',
    ]);
    expect(result.orders).toHaveLength(1);
    expect(result.customers).toHaveLength(1);
    expect(result.payments).toHaveLength(1);
  });
});

describe('Phase 5C.8 — Customer lock', () => {
  it('locks customer account', async () => {
    const repository = {
      findCustomerById: jest.fn().mockResolvedValue({ id: 'c1', email: 'c@test.com', orders: [] }),
    };
    const prisma = {
      user: { update: jest.fn().mockResolvedValue({ id: 'c1', email: 'c@test.com', status: UserStatus.SUSPENDED }) },
    };
    const adminAudit = { record: jest.fn() };
    const service = new AdminCustomerService(
      repository as never,
      prisma as never,
      adminAudit as never,
      { generateRefreshTokenValue: jest.fn(), hashToken: jest.fn() } as never,
      { notifyPasswordReset: jest.fn() } as never,
      { get: jest.fn().mockReturnValue('http://localhost') } as never,
    );

    const result = await service.lockCustomer('admin-1', 'c1');
    expect(result.status).toBe(UserStatus.SUSPENDED);
    expect(adminAudit.record).toHaveBeenCalled();
  });
});

describe('Phase 5C.8 — Staff management', () => {
  it('rejects creating SUPER_ADMIN via API', async () => {
    const service = new AdminStaffService(
      { findStaffUsers: jest.fn() } as never,
      { user: { findFirst: jest.fn() } } as never,
      { record: jest.fn() } as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createStaff('admin-1', {
        email: 'x@test.com',
        password: 'password123',
        fullName: 'X',
        role: UserRole.SUPER_ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents self-disable', async () => {
    const service = new AdminStaffService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.disableStaff('admin-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Phase 5C.8 — Agent invite', () => {
  it('requires invite token in INVITE_ONLY mode', () => {
    const settingsStore = {
      resolveSystemConfig: () => ({ agentRegistrationMode: AgentRegistrationMode.INVITE_ONLY }),
    };
    const service = new AgentInviteService({ agentInvite: { findFirst: jest.fn() } } as never, settingsStore as never);

    expect(() => service.requireInviteForMode()).toThrow(BadRequestException);
  });
});

describe('Phase 5C.8 — Customer account', () => {
  it('change password revokes sessions', async () => {
    const hash = await bcrypt.hash('oldpass123', 12);
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({ id: 'u1', passwordHash: hash }),
        update: jest.fn(),
      },
      $transaction: jest.fn((ops) => Promise.all(ops)),
      refreshToken: { updateMany: jest.fn() },
    };
    const service = new AccountService(prisma as never, { decrypt: jest.fn() } as never);

    const result = await service.changePassword('u1', {
      oldPassword: 'oldpass123',
      newPassword: 'newpass123',
      confirmPassword: 'newpass123',
    });

    expect(result.message).toContain('success');
    expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
  });

  it('getProfile never exposes identityNumber', async () => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1', username: 'u', fullName: 'U', email: 'u@test.com', phone: '0912345678',
          role: UserRole.CUSTOMER, emailVerifiedAt: null, identityNumberEnc: 'secret',
          createdAt: new Date(),
        }),
      },
    };
    const service = new AccountService(prisma as never, { decrypt: jest.fn() } as never);
    const profile = await service.getProfile('u1');
    expect(profile).not.toHaveProperty('identityNumberEnc');
    expect(profile).not.toHaveProperty('passwordHash');
  });
});
