/**
 * Phase 2E.3 — SePay webhook flow via PaymentService
 */
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { MegaPayProvider } from './providers/megapay/megapay.provider';
import { SePayProvider } from './providers/sepay/sepay.provider';
import { SepayConfigService } from './providers/sepay/sepay.config';
import { buildTransferContent } from './providers/sepay/sepay.types';
import { PaymentService } from './services/payment.service';

const SEPAY_CONFIG = {
  mode: 'legacy_qr' as const,
  apiKey: 'sepay-service-test-key',
  webhookSecret: 'sepay-wh-secret',
  bankAccount: '1017588888',
  bankCode: 'Vietcombank',
  accountName: 'CARDON CO',
  qrTemplate: 'compact',
};

function buildSePayService(deps: {
  paymentRepository: Record<string, jest.Mock>;
  orderService?: Record<string, jest.Mock>;
  paymentAuditService?: Record<string, jest.Mock>;
}) {
  const configService = {
    getConfig: () => SEPAY_CONFIG,
  } as unknown as SepayConfigService;
  const sepayProvider = new SePayProvider(configService);
  const registry = PaymentProviderRegistry.withProviders(
    {} as MegaPayProvider,
    sepayProvider,
  );

  return new PaymentService(
    { $transaction: jest.fn(async (cb) => cb({})) } as never,
    deps.paymentRepository as never,
    { create: jest.fn() } as never,
    registry,
    (deps.orderService ?? {
      markPaidInTransaction: jest.fn(),
      markPaymentFailedInTransaction: jest.fn(),
    }) as never,
    (deps.paymentAuditService ?? {
      recordPaymentSuccess: jest.fn(),
      recordPaymentFailed: jest.fn(),
    }) as never,
    { enqueueFulfillment: jest.fn() } as never,
    { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
  );
}

describe('PaymentService — SePay webhooks', () => {
  const paymentReference = 'PAY-SEPAY-SVC-001';
  const pendingPayment = {
    id: 'pay-sepay-1',
    orderId: 'order-1',
    gateway: PaymentGatewayCode.SEPAY,
    paymentReference,
    amount: new Decimal(100000),
    status: PaymentRecordStatus.PENDING,
    expiresAt: new Date(Date.now() + 600_000),
    gatewayResponse: {},
    order: {
      paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
      totalAmount: new Decimal(100000),
    },
  };

  function sepayPayload(overrides: Record<string, unknown> = {}) {
    return {
      id: 88001,
      content: buildTransferContent(paymentReference),
      transferType: 'in',
      transferAmount: 100000,
      ...overrides,
    };
  }

  it('processes valid SePay webhook and marks order paid', async () => {
    const paymentRepository = {
      findByReference: jest.fn().mockResolvedValue(pendingPayment),
      findSuccessByProviderTransactionId: jest.fn().mockResolvedValue(null),
      claimPendingStatus: jest.fn().mockResolvedValue({ count: 1 }),
    };
    const orderService = { markPaidInTransaction: jest.fn() };
    const paymentAuditService = { recordPaymentSuccess: jest.fn() };
    const service = buildSePayService({
      paymentRepository,
      orderService,
      paymentAuditService,
    });

    const result = await service.handleWebhook(
      'sepay',
      sepayPayload(),
      { Authorization: `Apikey ${SEPAY_CONFIG.apiKey}` },
    );

    expect(result.ok).toBe(true);
    expect(orderService.markPaidInTransaction).toHaveBeenCalled();
    expect(paymentAuditService.recordPaymentSuccess).toHaveBeenCalled();
  });

  it('rejects SePay webhook with invalid token', async () => {
    const service = buildSePayService({
      paymentRepository: { findByReference: jest.fn() },
    });

    await expect(
      service.handleWebhook(
        'sepay',
        sepayPayload(),
        { Authorization: 'Apikey wrong' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects SePay webhook with wrong amount', async () => {
    const paymentRepository = {
      findByReference: jest.fn().mockResolvedValue(pendingPayment),
      findSuccessByProviderTransactionId: jest.fn().mockResolvedValue(null),
    };
    const service = buildSePayService({ paymentRepository });

    await expect(
      service.handleWebhook(
        'sepay',
        sepayPayload({ transferAmount: 90000 }),
        { Authorization: `Apikey ${SEPAY_CONFIG.apiKey}` },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns OK for unknown reference without failing', async () => {
    const service = buildSePayService({
      paymentRepository: { findByReference: jest.fn() },
    });

    const result = await service.handleWebhook(
      'sepay',
      {
        id: 88002,
        content: 'chuyen tien khong co ma CARDON',
        transferType: 'in',
        transferAmount: 50000,
      },
      { Authorization: `Apikey ${SEPAY_CONFIG.apiKey}` },
    );

    expect(result.ok).toBe(true);
    expect(result.paymentReference).toBe('');
  });

  it('returns duplicate for same SePay transaction id already processed', async () => {
    const paymentRepository = {
      findByReference: jest.fn().mockResolvedValue(pendingPayment),
      findSuccessByProviderTransactionId: jest.fn().mockResolvedValue({
        id: 'pay-other',
        paymentReference: 'PAY-OTHER',
      }),
    };
    const orderService = { markPaidInTransaction: jest.fn() };
    const service = buildSePayService({ paymentRepository, orderService });

    const result = await service.handleWebhook(
      'sepay',
      sepayPayload({ id: 88001 }),
      { Authorization: `Apikey ${SEPAY_CONFIG.apiKey}` },
    );

    expect(result.duplicate).toBe(true);
    expect(orderService.markPaidInTransaction).not.toHaveBeenCalled();
  });
});
