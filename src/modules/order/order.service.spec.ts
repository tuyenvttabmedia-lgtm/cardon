/**
 * Phase 2D — Order Core Tests
 */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderService } from './services/order.service';
import { OrderExpirationService } from './services/order-expiration.service';

describe('OrderService', () => {
  let service: OrderService;
  let prisma: {
    $transaction: jest.Mock;
    systemSetting: { findUnique: jest.Mock };
    order: { findFirst: jest.Mock };
  };
  let orderRepository: {
    createFinancialTransaction: jest.Mock;
    createWithTransaction: jest.Mock;
    createOrderItem: jest.Mock;
    findByIdForUser: jest.Mock;
    findByCodeForGuest: jest.Mock;
    findById: jest.Mock;
    updateCustomerNote: jest.Mock;
  };
  let variantRepository: { findActiveById: jest.Mock };
  let pricingService: { getCustomerPrice: jest.Mock };
  let mappingRepository: { findLowestActiveCost: jest.Mock };
  let settingsStore: {
    resolvePaymentMethod: jest.Mock;
    getPublicPaymentMethods: jest.Mock;
  };
  let orderAuditService: { recordOrderCreated: jest.Mock };

  const customerUser = {
    id: 'user-1',
    email: 'customer@cardon.vn',
    role: 'CUSTOMER' as const,
  };

  const activeVariant = {
    id: 'var-garena-100k',
    sku: 'GARENA_100K',
    name: 'Garena 100k',
    faceValue: new Decimal(100000),
    sellPrice: new Decimal(99000),
    status: 'ACTIVE',
  };

  const defaultPaymentMethod = {
    gatewayCode: 'SEPAY' as const,
    methodCode: 'VIETQR',
    displayName: 'VietQR',
    description: 'Chuyển khoản QR',
    iconUrl: null,
    logoUrl: null,
    settlementType: 'DIRECT_TO_MERCHANT' as const,
    enabled: true,
    percentageFee: 0,
    fixedFee: 300,
  };

  beforeEach(() => {
    orderRepository = {
      createFinancialTransaction: jest.fn(),
      createWithTransaction: jest.fn(),
      createOrderItem: jest.fn(),
      findByIdForUser: jest.fn(),
      findByCodeForGuest: jest.fn(),
      findById: jest.fn(),
      updateCustomerNote: jest.fn(),
    };
    variantRepository = { findActiveById: jest.fn() };
    pricingService = { getCustomerPrice: jest.fn() };
    mappingRepository = {
      findLowestActiveCost: jest.fn().mockResolvedValue({ providerCost: new Decimal(97500) }),
    };
    settingsStore = {
      resolvePaymentMethod: jest.fn().mockReturnValue(defaultPaymentMethod),
      getPublicPaymentMethods: jest.fn().mockReturnValue([defaultPaymentMethod]),
    };
    orderAuditService = { recordOrderCreated: jest.fn() };

    prisma = {
      $transaction: jest.fn(async (cb) => {
        const tx = {
          order: {
            findFirst: jest.fn(),
          },
        };
        return cb(tx);
      }),
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue({ value: 15 }),
      },
      order: { findFirst: jest.fn() },
    };

    service = new OrderService(
      prisma as never,
      orderRepository as never,
      variantRepository as never,
      pricingService as never,
      mappingRepository as never,
      settingsStore as never,
      orderAuditService as never,
      { decrypt: jest.fn() } as never,
    );
  });

  function mockSuccessfulCreate(params: {
    quantity?: number;
    unitPrice?: string;
    orderId?: string;
  }) {
    const quantity = params.quantity ?? 1;
    const unitPrice = params.unitPrice ?? '99000.00';
    const orderId = params.orderId ?? 'order-1';

    variantRepository.findActiveById.mockResolvedValue(activeVariant);
    pricingService.getCustomerPrice.mockResolvedValue(unitPrice);

    orderRepository.createFinancialTransaction.mockResolvedValue({
      id: 'txn-1',
    });
    orderRepository.createWithTransaction.mockResolvedValue({
      id: orderId,
      orderCode: 'ORD-20250618-ABC123',
    });
    orderRepository.createOrderItem.mockResolvedValue({ id: 'item-1' });

    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        order: {
          findFirst: jest.fn().mockResolvedValue({
            id: orderId,
            orderCode: 'ORD-20250618-ABC123',
            channel: OrderChannel.B2C,
            isGuestOrder: false,
            guestEmail: customerUser.email,
            guestPhone: null,
            invoiceRequired: false,
            invoiceMetadata: {},
            customerNote: null,
            totalAmount: new Decimal(99300),
            faceValue: new Decimal(100000),
            sellAmount: new Decimal(unitPrice).mul(quantity),
            discountAmount: new Decimal(1000),
            paymentMethodCode: 'VIETQR',
            methodDisplayName: 'VietQR',
            paymentGateway: 'SEPAY',
            settlementType: 'DIRECT_TO_MERCHANT',
            paymentFeePercent: new Decimal(0),
            paymentFeeFixed: new Decimal(300),
            paymentFeeAmount: new Decimal(300),
            customerPaid: new Decimal(99300),
            providerCost: new Decimal(97500),
            profit: new Decimal(1500),
            paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            fulfillmentStatus: FulfillmentStatus.PENDING,
            paymentExpiresAt: new Date('2026-06-18T12:00:00Z'),
            createdAt: new Date('2026-06-18T11:45:00Z'),
            orderItems: [
              {
                id: 'item-1',
                variantId: activeVariant.id,
                quantity,
                unitPrice: new Decimal(unitPrice),
                discount: new Decimal(0),
                totalAmount: new Decimal(unitPrice).mul(quantity),
                status: 'PENDING',
                variant: { sku: activeVariant.sku, name: activeVariant.name },
              },
            ],
          }),
        },
      };
      return cb(tx);
    });
  }

  it('creates authenticated customer order', async () => {
    mockSuccessfulCreate({});

    const result = await service.createOrder(
      {
        items: [{ variantId: activeVariant.id, quantity: 1 }],
      },
      customerUser,
    );

    expect(result.orderCode).toBe('ORD-20250618-ABC123');
    expect(result.isGuestOrder).toBe(false);
    expect(result.paymentStatus).toBe(OrderPaymentStatus.WAITING_PAYMENT);
    expect(orderAuditService.recordOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: customerUser.id }),
    );
  });

  it('stores client trace metadata on order create', async () => {
    mockSuccessfulCreate({});

    await service.createOrder(
      {
        items: [{ variantId: activeVariant.id, quantity: 1 }],
        clientDeviceInfo: { platform: 'Win32', touch: false },
      },
      customerUser,
      { ip: '203.0.113.10', userAgent: 'Mozilla/Test' },
    );

    expect(orderRepository.createWithTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        clientTrace: expect.objectContaining({
          customerId: customerUser.id,
          customerEmail: customerUser.email,
          ipAddress: '203.0.113.10',
          userAgent: 'Mozilla/Test',
          deviceInfo: { platform: 'Win32', touch: false },
        }),
      }),
    );
  });

  it('creates guest order with guest_email', async () => {
    mockSuccessfulCreate({});
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        order: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'order-guest',
            orderCode: 'ORD-20250618-GUEST1',
            channel: OrderChannel.B2C,
            isGuestOrder: true,
            guestEmail: 'guest@example.com',
            guestPhone: '0901234567',
            invoiceRequired: false,
            invoiceMetadata: {},
            customerNote: null,
            totalAmount: new Decimal(99000),
            paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            fulfillmentStatus: FulfillmentStatus.PENDING,
            paymentExpiresAt: new Date(),
            createdAt: new Date(),
            orderItems: [
              {
                id: 'item-1',
                variantId: activeVariant.id,
                quantity: 1,
                unitPrice: new Decimal(99000),
                discount: new Decimal(0),
                totalAmount: new Decimal(99000),
                status: 'PENDING',
                variant: { sku: activeVariant.sku, name: activeVariant.name },
              },
            ],
          }),
        },
      };
      return cb(tx);
    });

    const result = await service.createOrder({
      items: [{ variantId: activeVariant.id, quantity: 1 }],
      guestEmail: 'guest@example.com',
      guestPhone: '0901234567',
    });

    expect(result.isGuestOrder).toBe(true);
    expect(result.guestEmail).toBe('guest@example.com');
  });

  it('rejects guest order without guest_email', async () => {
    await expect(
      service.createOrder({
        items: [{ variantId: activeVariant.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates one order_item with quantity=10 for multi-quantity purchase', async () => {
    mockSuccessfulCreate({ quantity: 10 });

    const result = await service.createOrder(
      {
        items: [{ variantId: activeVariant.id, quantity: 10 }],
      },
      customerUser,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(10);
    expect(result.items[0].totalAmount).toBe('990000.00');
    expect(orderRepository.createOrderItem).toHaveBeenCalledTimes(1);
    expect(orderRepository.createOrderItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantity: 10 }),
    );
  });

  it('rejects inactive variant', async () => {
    variantRepository.findActiveById.mockResolvedValue(null);

    await expect(
      service.createOrder(
        {
          items: [{ variantId: 'inactive-var', quantity: 1 }],
        },
        customerUser,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('locks price snapshot at order creation time', async () => {
    mockSuccessfulCreate({ unitPrice: '98000.00', quantity: 2 });

    const result = await service.createOrder(
      {
        items: [{ variantId: activeVariant.id, quantity: 2 }],
      },
      customerUser,
    );

    expect(pricingService.getCustomerPrice).toHaveBeenCalledWith(activeVariant.id);
    expect(result.items[0].unitPrice).toBe('98000.00');
    expect(result.items[0].totalAmount).toBe('196000.00');
  });

  it('rejects modification of completed order', async () => {
    orderRepository.findById.mockResolvedValue({
      id: 'order-done',
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      fulfillmentStatus: FulfillmentStatus.COMPLETED,
    });

    await expect(
      service.updateCustomerNote('order-done', { customerNote: 'updated' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects modification of paid order', async () => {
    orderRepository.findById.mockResolvedValue({
      id: 'order-paid',
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: FulfillmentStatus.PENDING,
    });

    await expect(
      service.updateCustomerNote('order-paid', { customerNote: 'updated' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('User A cannot access User B order', async () => {
    orderRepository.findByIdForUser.mockResolvedValue(null);

    await expect(
      service.getCustomerOrder('order-b', 'user-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('guest lookup returns order when order_code and email match', async () => {
    orderRepository.findByCodeForGuest.mockResolvedValue({
      id: 'order-guest',
      orderCode: 'ORD-20250618-GUEST1',
      channel: OrderChannel.B2C,
      isGuestOrder: true,
      guestEmail: 'guest@example.com',
      guestPhone: null,
      invoiceRequired: false,
      invoiceMetadata: {},
      customerNote: null,
      totalAmount: new Decimal(99000),
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      fulfillmentStatus: FulfillmentStatus.PENDING,
      paymentExpiresAt: null,
      createdAt: new Date(),
      orderItems: [],
    });

    const result = await service.lookupGuestOrder(
      'ORD-20250618-GUEST1',
      'guest@example.com',
    );

    expect(result.orderCode).toBe('ORD-20250618-GUEST1');
  });

  it('guest lookup rejects wrong email (security)', async () => {
    orderRepository.findByCodeForGuest.mockResolvedValue(null);

    await expect(
      service.lookupGuestOrder('ORD-20250618-GUEST1', 'attacker@evil.com'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('OrderExpirationService', () => {
  it('expires WAITING_PAYMENT order past payment_expires_at', async () => {
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderCode: 'ORD-EXP',
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          paymentExpiresAt: new Date('2020-01-01T00:00:00Z'),
          deletedAt: null,
        }),
        update: jest.fn(),
      },
    };
    const orderRepository = {
      findWaitingPaymentExpired: jest.fn(),
    };
    const orderAuditService = {
      recordOrderExpired: jest.fn(),
    };

    const service = new OrderExpirationService(
      prisma as never,
      orderRepository as never,
      orderAuditService as never,
    );

    const expired = await service.expireOrder('order-1');

    expect(expired).toBe(true);
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: OrderPaymentStatus.EXPIRED },
    });
    expect(orderAuditService.recordOrderExpired).toHaveBeenCalled();
  });
});

describe('Order state machine', () => {
  it('blocks fulfillment when unpaid', () => {
    const { assertCanFulfill } = require('./entities/order-state.machine');
    expect(() =>
      assertCanFulfill(OrderPaymentStatus.WAITING_PAYMENT),
    ).toThrow(BadRequestException);
  });

  it('blocks EXPIRED → PAID transition', () => {
    const { assertPaymentTransition, assertCanMarkPaid } =
      require('./entities/order-state.machine');
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
