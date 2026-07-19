/**
 * Phase 2E â€” Payment Core Tests
 */
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { computeMockWebhookSignature, MockMegaPayProvider, MockSePayProvider } from './providers/mock-payment.providers';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PaymentService } from './services/payment.service';
import { PaymentExpirationService } from './services/payment-expiration.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: {
    order: { findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
    payment: { create: jest.Mock; findUnique: jest.Mock };
  };
  let paymentRepository: {
    findByIdempotencyKey: jest.Mock;
    findByReference: jest.Mock;
    findById: jest.Mock;
    claimPendingStatus: jest.Mock;
    recordLateWebhookManualReview: jest.Mock;
  };
  let webhookLogRepository: { create: jest.Mock };
  let orderService: {
    markPaidInTransaction: jest.Mock;
    markPaymentFailedInTransaction: jest.Mock;
  };
  let paymentAuditService: {
    recordPaymentCreated: jest.Mock;
    recordPaymentSuccess: jest.Mock;
    recordPaymentFailed: jest.Mock;
    recordDuplicateWebhook: jest.Mock;
  };
  let fulfillmentDispatchService: { dispatchOrderFulfillment: jest.Mock };

  const waitingOrder = {
    id: 'order-1',
    userId: 'user-1',
    totalAmount: new Decimal(100000),
    paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
    paymentExpiresAt: new Date(Date.now() + 600_000),
    deletedAt: null,
  };

  const pendingPayment = {
    id: 'pay-1',
    orderId: 'order-1',
    gateway: PaymentGatewayCode.MEGAPAY,
    paymentReference: 'PAY-REF-001',
    amount: new Decimal(100000),
    status: PaymentRecordStatus.PENDING,
    expiresAt: new Date(Date.now() + 600_000),
    gatewayResponse: {},
    order: {
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      totalAmount: new Decimal(100000),
    },
  };

  beforeEach(() => {
    paymentRepository = {
      findByIdempotencyKey: jest.fn(),
      findByReference: jest.fn(),
      findById: jest.fn(),
      claimPendingStatus: jest.fn().mockResolvedValue({ count: 1 }),
      recordLateWebhookManualReview: jest.fn(),
    };
    webhookLogRepository = { create: jest.fn() };
    orderService = {
      markPaidInTransaction: jest.fn(),
      markPaymentFailedInTransaction: jest.fn(),
    };
    paymentAuditService = {
      recordPaymentCreated: jest.fn(),
      recordPaymentSuccess: jest.fn(),
      recordPaymentFailed: jest.fn(),
      recordDuplicateWebhook: jest.fn(),
    };
    fulfillmentDispatchService = {
      dispatchOrderFulfillment: jest.fn().mockResolvedValue(['job-fulfill-1']),
    };

    prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(waitingOrder),
        update: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(async (cb) => cb({})),
    };

    service = new PaymentService(
      prisma as never,
      paymentRepository as never,
      webhookLogRepository as never,
      PaymentProviderRegistry.withProviders(
        new MockMegaPayProvider(),
        new MockSePayProvider(),
      ),
      orderService as never,
      paymentAuditService as never,
      fulfillmentDispatchService as never,
      { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
    );
  });

  it('creates payment for WAITING_PAYMENT order', async () => {
    prisma.$transaction.mockImplementation(async (cb) => {
      const tx = {
        payment: {
          create: jest.fn().mockResolvedValue({
            id: 'pay-1',
            orderId: 'order-1',
            gateway: PaymentGatewayCode.MEGAPAY,
            paymentReference: 'PAY-REF-001',
            amount: new Decimal(100000),
            status: PaymentRecordStatus.PENDING,
            expiresAt: waitingOrder.paymentExpiresAt,
            gatewayResponse: {
              paymentUrl: 'https://mock.megapay.example/checkout/PAY-REF-001',
            },
            paidAt: null,
            createdAt: new Date(),
          }),
        },
        order: { update: jest.fn() },
      };
      return cb(tx);
    });

    const result = await service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.MEGAPAY },
      'idem-key-1',
      { id: 'user-1', email: 'u@test.com', role: 'CUSTOMER' },
    );

    expect(result.status).toBe(PaymentRecordStatus.PENDING);
    expect(result.paymentUrl).toContain('mock.megapay.example');
    expect(paymentAuditService.recordPaymentCreated).toHaveBeenCalled();
  });

  it('returns same payment for duplicate idempotency key', async () => {
    paymentRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'pay-existing',
      orderId: 'order-1',
      gateway: PaymentGatewayCode.MEGAPAY,
      paymentReference: 'PAY-EXISTING',
      amount: new Decimal(100000),
      status: PaymentRecordStatus.PENDING,
      expiresAt: new Date(),
      paidAt: null,
      createdAt: new Date(),
      gatewayResponse: { paymentUrl: 'https://mock.example/existing' },
    });

    const result = await service.createPayment(
      { orderId: 'order-1', gateway: PaymentGatewayCode.MEGAPAY },
      'idem-key-dup',
    );

    expect(result.paymentReference).toBe('PAY-EXISTING');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('processes webhook success and marks order paid atomically', async () => {
    const payload = {
      paymentReference: 'PAY-REF-001',
      status: 'SUCCESS',
      amount: '100000.00',
    };
    const signature = computeMockWebhookSignature(payload);

    paymentRepository.findByReference.mockResolvedValue(pendingPayment);

    const result = await service.handleWebhook(
      'megapay',
      payload,
      { 'x-webhook-signature': signature },
      '127.0.0.1',
    );

    expect(result.ok).toBe(true);
    expect(paymentRepository.claimPendingStatus).toHaveBeenCalled();
    expect(orderService.markPaidInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      'order-1',
      'pay-1',
    );
    expect(paymentAuditService.recordPaymentSuccess).toHaveBeenCalled();
    expect(fulfillmentDispatchService.dispatchOrderFulfillment).toHaveBeenCalledWith(
      'order-1',
      'webhook',
    );
  });

  it('returns OK for duplicate SUCCESS webhook without reprocessing or audit', async () => {
    paymentRepository.findByReference.mockResolvedValue({
      ...pendingPayment,
      status: PaymentRecordStatus.SUCCESS,
      order: { paymentStatus: OrderPaymentStatus.PAID },
    });

    const payload = { paymentReference: 'PAY-REF-001', status: 'SUCCESS' };
    const signature = computeMockWebhookSignature(payload);

    const result = await service.handleWebhook(
      'megapay',
      payload,
      { 'x-webhook-signature': signature },
    );

    expect(result.duplicate).toBe(true);
    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
    expect(paymentAuditService.recordDuplicateWebhook).not.toHaveBeenCalled();
    expect(paymentAuditService.recordPaymentSuccess).not.toHaveBeenCalled();
  });

  it('handles concurrent webhook race â€” only one claim succeeds', async () => {
    paymentRepository.findByReference.mockResolvedValue(pendingPayment);
    paymentRepository.claimPendingStatus.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (cb) =>
      cb({
        payment: {
          findUnique: jest.fn().mockResolvedValue({
            status: PaymentRecordStatus.SUCCESS,
          }),
        },
      }),
    );

    const payload = {
      paymentReference: 'PAY-REF-001',
      status: 'SUCCESS',
      amount: '100000.00',
    };
    const signature = computeMockWebhookSignature(payload);

    const result = await service.handleWebhook(
      'megapay',
      payload,
      { 'x-webhook-signature': signature },
    );

    expect(result.duplicate).toBe(true);
    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
    expect(paymentAuditService.recordPaymentSuccess).not.toHaveBeenCalled();
  });

  it('rejects webhook with amount mismatch', async () => {
    paymentRepository.findByReference.mockResolvedValue(pendingPayment);

    const payload = {
      paymentReference: 'PAY-REF-001',
      status: 'SUCCESS',
      amount: '90000.00',
    };
    const signature = computeMockWebhookSignature(payload);

    await expect(
      service.handleWebhook(
        'megapay',
        payload,
        { 'x-webhook-signature': signature },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
  });

  it('returns OK for PENDING webhook without updating payment', async () => {
    paymentRepository.findByReference.mockResolvedValue(pendingPayment);

    const payload = { paymentReference: 'PAY-REF-001', status: 'PENDING' };
    const signature = computeMockWebhookSignature(payload);

    const result = await service.handleWebhook(
      'megapay',
      payload,
      { 'x-webhook-signature': signature },
    );

    expect(result.ok).toBe(true);
    expect(paymentRepository.claimPendingStatus).not.toHaveBeenCalled();
    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
    expect(orderService.markPaymentFailedInTransaction).not.toHaveBeenCalled();
  });

  it('rejects invalid webhook signature', async () => {
    await expect(
      service.handleWebhook(
        'megapay',
        { paymentReference: 'PAY-1', status: 'SUCCESS' },
        { 'x-webhook-signature': 'invalid' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown payment_reference', async () => {
    paymentRepository.findByReference.mockResolvedValue(null);
    const payload = { paymentReference: 'UNKNOWN', status: 'SUCCESS', amount: '100' };
    const signature = computeMockWebhookSignature(payload);

    await expect(
      service.handleWebhook(
        'megapay',
        payload,
        { 'x-webhook-signature': signature },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns manualReview for late SUCCESS on expired payment', async () => {
    paymentRepository.findByReference.mockResolvedValue({
      ...pendingPayment,
      status: PaymentRecordStatus.EXPIRED,
      expiresAt: new Date('2020-01-01'),
      order: { paymentStatus: OrderPaymentStatus.EXPIRED },
    });

    const payload = {
      paymentReference: 'PAY-REF-001',
      status: 'SUCCESS',
      amount: '100000.00',
    };
    const signature = computeMockWebhookSignature(payload);

    const result = await service.handleWebhook(
      'megapay',
      payload,
      { 'x-webhook-signature': signature },
    );

    expect(result.manualReview).toBe(true);
    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
    expect(paymentRepository.recordLateWebhookManualReview).toHaveBeenCalled();
  });

  it('requires Idempotency-Key header', async () => {
    await expect(
      service.createPayment(
        { orderId: 'order-1', gateway: PaymentGatewayCode.MEGAPAY },
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PaymentExpirationService', () => {
  it('expires PENDING payment past expiresAt', async () => {
    const paymentRepository = {
      findById: jest.fn().mockResolvedValue({
        id: 'pay-1',
        orderId: 'order-1',
        status: PaymentRecordStatus.PENDING,
        expiresAt: new Date('2020-01-01'),
      }),
      updateStatus: jest.fn(),
      findPendingExpired: jest.fn(),
    };
    const orderRepository = {
      updatePaymentStatus: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (cb) =>
        cb({
          order: {
            findUnique: jest.fn().mockResolvedValue({
              paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
            }),
          },
        }),
      ),
    };

    const service = new PaymentExpirationService(
      prisma as never,
      paymentRepository as never,
      orderRepository as never,
    );

    const expired = await service.expirePayment('pay-1');
    expect(expired).toBe(true);
    expect(paymentRepository.updateStatus).toHaveBeenCalledWith(
      'pay-1',
      PaymentRecordStatus.EXPIRED,
      undefined,
      expect.anything(),
    );
  });
});

describe('Payment state machine', () => {
  it('blocks EXPIRED â†’ SUCCESS on payment record', () => {
    const { assertPaymentRecordTransition } =
      require('./entities/payment-state.machine');
    expect(() =>
      assertPaymentRecordTransition(
        PaymentRecordStatus.EXPIRED,
        PaymentRecordStatus.SUCCESS,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects amount mismatch', () => {
    const { assertWebhookAmountMatches } =
      require('./entities/payment-state.machine');
    expect(() =>
      assertWebhookAmountMatches(new Decimal(100000), '90000.00'),
    ).toThrow(BadRequestException);
  });
});

describe('OrderService.markPaid integration', () => {
  it('marks order PAID when called from payment flow', async () => {
    const { OrderService } = require('../order/services/order.service');
    const orderRepository = {
      findByIdWithPaymentFields: jest.fn(),
      updatePaymentStatus: jest.fn(),
      linkActivePayment: jest.fn(),
    };
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          paymentExpiresAt: new Date(Date.now() + 600_000),
        }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (cb) => cb(tx)),
    };

    const orderService = new OrderService(
      prisma as never,
      orderRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await orderService.markPaidInTransaction(tx as never, 'order-1', 'pay-1');

    expect(orderRepository.updatePaymentStatus).toHaveBeenCalledWith(
      'order-1',
      OrderPaymentStatus.PAID,
      expect.anything(),
    );
    expect(orderRepository.linkActivePayment).toHaveBeenCalledWith(
      'order-1',
      'pay-1',
      expect.anything(),
    );
  });

  it('rejects markPaid on EXPIRED order', async () => {
    const { OrderService } = require('../order/services/order.service');
    const orderRepository = {
      updatePaymentStatus: jest.fn(),
      linkActivePayment: jest.fn(),
    };
    const tx = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          paymentStatus: OrderPaymentStatus.EXPIRED,
          paymentExpiresAt: new Date('2020-01-01'),
        }),
      },
    };
    const prisma = {};

    const orderService = new OrderService(
      prisma as never,
      orderRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      orderService.markPaidInTransaction(tx as never, 'order-exp', 'pay-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
