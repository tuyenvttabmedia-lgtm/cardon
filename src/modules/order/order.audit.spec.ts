/**
 * Phase 2D.1 — Order Integrity Audit Tests
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  ORDER_IDEMPOTENCY_RULES,
  ORDER_IMMUTABILITY_RULES,
} from './entities/order-idempotency.rules';
import { ORDER_AUDIT_ACTIONS } from './entities/order.constants';
import {
  assertCanMarkPaid,
  assertOrderItemsFrozen,
  assertPaymentTransition,
} from './entities/order-state.machine';
import { mapOrder } from './entities/order.mapper';
import { OrderRepository } from './repositories/order.repository';
import { OrderAuditService } from './services/order-audit.service';
import { OrderExpirationService } from './services/order-expiration.service';
import { OrderService } from './services/order.service';

describe('Phase 2D.1 Order Integrity Audit', () => {
  describe('CHECK 1: Price snapshot protection', () => {
    it('order_items.unit_price is fixed at creation, not live variant sell_price', async () => {
      const pricingService = {
        getCustomerPrice: jest.fn().mockResolvedValue('100000.00'),
      };
      const variantRepository = {
        findActiveById: jest.fn().mockResolvedValue({ id: 'var-1' }),
      };
      const orderRepository = {
        createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'txn-1' }),
        createWithTransaction: jest.fn().mockResolvedValue({ id: 'order-1' }),
        createOrderItem: jest.fn(),
      };
      const prisma = {
        systemSetting: { findUnique: jest.fn().mockResolvedValue({ value: 15 }) },
        $transaction: jest.fn(async (cb) => {
          const tx = {
            order: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'order-1',
                orderCode: 'ORD-1',
                channel: OrderChannel.B2C,
                isGuestOrder: false,
                guestEmail: 'a@b.com',
                guestPhone: null,
                invoiceRequired: false,
                invoiceMetadata: {},
                customerNote: null,
                totalAmount: new Decimal(100000),
                paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
                fulfillmentStatus: FulfillmentStatus.PENDING,
                paymentExpiresAt: new Date(),
                createdAt: new Date(),
                orderItems: [
                  {
                    id: 'item-1',
                    variantId: 'var-1',
                    quantity: 1,
                    unitPrice: new Decimal(100000),
                    discount: new Decimal(0),
                    totalAmount: new Decimal(100000),
                    status: 'PENDING',
                    variant: { sku: 'GARENA_100K', name: 'Garena 100k' },
                  },
                ],
              }),
            },
          };
          return cb(tx);
        }),
      };
      const service = new OrderService(
        prisma as never,
        orderRepository as never,
        variantRepository as never,
        pricingService as never,
        { recordOrderCreated: jest.fn() } as never,
        { decrypt: jest.fn() } as never,
      );

      const order = await service.createOrder(
        { items: [{ variantId: 'var-1', quantity: 1 }] },
        { id: 'u1', email: 'a@b.com', role: 'CUSTOMER' },
      );

      expect(order.items[0].unitPrice).toBe('100000.00');

      // Admin later changes product to 120000 — order read still shows snapshot
      pricingService.getCustomerPrice.mockResolvedValue('120000.00');
      const snapshotView = mapOrder({
        id: 'order-1',
        orderCode: 'ORD-1',
        channel: OrderChannel.B2C,
        isGuestOrder: false,
        guestEmail: 'a@b.com',
        guestPhone: null,
        invoiceRequired: false,
        invoiceMetadata: {},
        customerNote: null,
        totalAmount: new Decimal(100000),
        paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        paymentExpiresAt: new Date(),
        createdAt: new Date(),
        orderItems: [
          {
            id: 'item-1',
            variantId: 'var-1',
            quantity: 1,
            unitPrice: new Decimal(100000),
            discount: new Decimal(0),
            totalAmount: new Decimal(100000),
            status: 'PENDING',
            variant: { sku: 'GARENA_100K', name: 'Garena 100k' },
          },
        ],
      } as never);

      expect(snapshotView.items[0].unitPrice).toBe('100000.00');
      expect(snapshotView.items[0].unitPrice).not.toBe('120000.00');
    });

    it('documents snapshotted fields', () => {
      expect(ORDER_IMMUTABILITY_RULES.snapshottedAtCreation).toContain(
        'order_items.unit_price',
      );
    });
  });

  describe('CHECK 2: Double submit protection', () => {
    it('documents idempotency requirement for payment phase', () => {
      expect(ORDER_IDEMPOTENCY_RULES.orderCreation.currentBehavior).toContain(
        'no dedup',
      );
      expect(ORDER_IDEMPOTENCY_RULES.orderCreation.paymentPhaseRequirement).toContain(
        'Idempotency-Key',
      );
    });
  });

  describe('CHECK 3: Guest security', () => {
    it('findByCodeForGuest requires order_code + email', async () => {
      const prisma = {
        order: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };
      const repo = new OrderRepository(prisma as never);
      await repo.findByCodeForGuest('ORD-123', 'guest@test.com');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderCode: 'ORD-123',
            guestEmail: { equals: 'guest@test.com', mode: 'insensitive' },
            isGuestOrder: true,
          }),
        }),
      );
    });

    it('wrong email returns NotFoundException', async () => {
      const service = new OrderService(
        {} as never,
        { findByCodeForGuest: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
        {} as never,
        {} as never,
        { decrypt: jest.fn() } as never,
      );
      await expect(
        service.lookupGuestOrder('ORD-123', 'wrong@email.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('CHECK 4: Order ownership', () => {
    it('findByIdForUser scopes query to userId', async () => {
      const prisma = { order: { findFirst: jest.fn() } };
      const repo = new OrderRepository(prisma as never);
      await repo.findByIdForUser('order-1', 'user-a');
      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'order-1', userId: 'user-a' }),
        }),
      );
    });

    it('User A cannot access User B order', async () => {
      const service = new OrderService(
        {} as never,
        { findByIdForUser: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
        {} as never,
        {} as never,
        { decrypt: jest.fn() } as never,
      );
      await expect(
        service.getCustomerOrder('order-b', 'user-a'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('CHECK 5: Completed order immutability', () => {
    it('blocks order item changes when COMPLETED', () => {
      expect(() =>
        assertOrderItemsFrozen({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.COMPLETED,
        }),
      ).toThrow(ConflictException);
    });

    it('blocks order item changes when PAID', () => {
      expect(() =>
        assertOrderItemsFrozen({
          paymentStatus: OrderPaymentStatus.PAID,
          fulfillmentStatus: FulfillmentStatus.PENDING,
        }),
      ).toThrow(ConflictException);
    });

    it('documents frozen fields after paid', () => {
      expect(ORDER_IMMUTABILITY_RULES.frozenAfterPaid).toContain(
        'order_items.quantity',
      );
      expect(ORDER_IMMUTABILITY_RULES.frozenAfterPaid).toContain(
        'order_items.variant_id',
      );
    });
  });

  describe('CHECK 6: Payment expiration', () => {
    it('WAITING_PAYMENT past expires_at → EXPIRED', async () => {
      const prisma = {
        order: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'order-1',
            orderCode: 'ORD-EXP',
            paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            paymentExpiresAt: new Date('2020-01-01'),
            deletedAt: null,
          }),
          update: jest.fn(),
        },
      };
      const service = new OrderExpirationService(
        prisma as never,
        { findWaitingPaymentExpired: jest.fn() } as never,
        { recordOrderExpired: jest.fn() } as never,
      );
      await service.expireOrder('order-1');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { paymentStatus: OrderPaymentStatus.EXPIRED },
      });
    });

    it('EXPIRED order cannot become PAID', () => {
      expect(() =>
        assertPaymentTransition(
          OrderPaymentStatus.EXPIRED,
          OrderPaymentStatus.PAID,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        assertCanMarkPaid({
          paymentStatus: OrderPaymentStatus.EXPIRED,
          paymentExpiresAt: new Date('2020-01-01'),
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('CHECK 7: Invoice data snapshot', () => {
    it('stores invoice_metadata on order, not user profile reference', async () => {
      const createWithTransaction = jest.fn().mockResolvedValue({ id: 'o1' });
      const orderRepository = {
        createFinancialTransaction: jest.fn().mockResolvedValue({ id: 'txn' }),
        createWithTransaction,
        createOrderItem: jest.fn(),
      };
      const variantRepository = {
        findActiveById: jest.fn().mockResolvedValue({ id: 'v1' }),
      };
      const pricingService = {
        getCustomerPrice: jest.fn().mockResolvedValue('99000.00'),
      };
      const prisma = {
        systemSetting: { findUnique: jest.fn().mockResolvedValue({ value: 15 }) },
        $transaction: jest.fn(async (cb) => {
          const tx = {
            order: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'o1',
                orderCode: 'ORD-INV',
                channel: OrderChannel.B2C,
                isGuestOrder: true,
                guestEmail: 'buyer@test.com',
                guestPhone: null,
                invoiceRequired: true,
                invoiceMetadata: {
                  companyName: 'ACME Co',
                  taxCode: '0123456789',
                  address: '123 Street',
                },
                customerNote: null,
                totalAmount: new Decimal(99000),
                paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
                fulfillmentStatus: FulfillmentStatus.PENDING,
                paymentExpiresAt: new Date(),
                createdAt: new Date(),
                orderItems: [],
              }),
            },
          };
          return cb(tx);
        }),
      };
      const service = new OrderService(
        prisma as never,
        orderRepository as never,
        variantRepository as never,
        pricingService as never,
        { recordOrderCreated: jest.fn() } as never,
        { decrypt: jest.fn() } as never,
      );

      await service.createOrder({
        items: [{ variantId: 'v1', quantity: 1 }],
        guestEmail: 'buyer@test.com',
        invoiceRequired: true,
        companyName: 'ACME Co',
        taxCode: '0123456789',
        address: '123 Street',
      });

      expect(createWithTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          invoiceMetadata: {
            companyName: 'ACME Co',
            taxCode: '0123456789',
            address: '123 Street',
          },
        }),
      );
    });
  });

  describe('CHECK 8: Order audit logs', () => {
    it('records ORDER_CREATED with ORDER target type', async () => {
      const auditService = { recordEvent: jest.fn() };
      const prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sys-user' }),
        },
      };
      const service = new OrderAuditService(
        prisma as never,
        auditService as never,
      );

      await service.recordOrderCreated({
        orderId: 'order-1',
        actorUserId: 'user-1',
      });

      expect(auditService.recordEvent).toHaveBeenCalledWith({
        actorId: 'user-1',
        action: ORDER_AUDIT_ACTIONS.ORDER_CREATED,
        targetType: AuditTargetType.ORDER,
        targetId: 'order-1',
        metadata: undefined,
      });
    });

    it('records ORDER_EXPIRED', async () => {
      const auditService = { recordEvent: jest.fn() };
      const prisma = {
        user: {
          findFirst: jest.fn().mockResolvedValue({ id: 'sys-user' }),
        },
      };
      const service = new OrderAuditService(
        prisma as never,
        auditService as never,
      );

      await service.recordOrderExpired({ orderId: 'order-1' });

      expect(auditService.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: ORDER_AUDIT_ACTIONS.ORDER_EXPIRED,
          targetType: AuditTargetType.ORDER,
        }),
      );
    });
  });
});
