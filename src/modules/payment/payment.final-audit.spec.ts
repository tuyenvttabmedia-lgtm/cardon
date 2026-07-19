/**
 * Phase 2E.4 — Payment Gateway Final Audit Tests
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PAYMENT_LATE_WEBHOOK_RULES } from './entities/payment-refund.rules';
import { PAYMENT_SUCCESS_QUEUE_RULES } from './entities/payment-success-queue.rules';
import {
  computeMockWebhookSignature,
  MockMegaPayProvider,
  MockSePayProvider,
} from './providers/mock-payment.providers';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import { PaymentService } from './services/payment.service';

describe('Phase 2E.4 Payment Gateway Final Audit', () => {
  describe('CHECK 1: Provider abstraction', () => {
    it('PaymentService source never imports MegaPayProvider or SePayProvider directly', () => {
      const source = readFileSync(
        join(process.cwd(), 'src/modules/payment/services/payment.service.ts'),
        'utf8',
      );
      expect(source).not.toMatch(/import.*MegaPayProvider/);
      expect(source).not.toMatch(/import.*SePayProvider/);
      expect(source).toContain('PaymentProviderRegistry');
      expect(source).toContain('providerRegistry.get');
      expect(source).toContain('provider.createPayment');
      expect(source).toContain('provider.verifyWebhook');
    });
  });

  describe('CHECK 2: Gateway switching', () => {
    it('MegaPay and SePay providers operate independently via registry', () => {
      const megapay = new MockMegaPayProvider();
      const sepay = new MockSePayProvider();
      const registry = PaymentProviderRegistry.withProviders(megapay, sepay);

      expect(registry.get(PaymentGatewayCode.MEGAPAY).gateway).toBe(
        PaymentGatewayCode.MEGAPAY,
      );
      expect(registry.get(PaymentGatewayCode.SEPAY).gateway).toBe(
        PaymentGatewayCode.SEPAY,
      );
      expect(registry.get(PaymentGatewayCode.MEGAPAY)).not.toBe(
        registry.get(PaymentGatewayCode.SEPAY),
      );
    });

    it('createPayment routes to correct gateway implementation', async () => {
      const megapay = new MockMegaPayProvider();
      const sepay = new MockSePayProvider();
      const megapayCreate = jest.spyOn(megapay, 'createPayment');
      const sepayCreate = jest.spyOn(sepay, 'createPayment');
      const registry = PaymentProviderRegistry.withProviders(megapay, sepay);

      await registry.get(PaymentGatewayCode.MEGAPAY).createPayment({
        paymentReference: 'PAY-A',
        amount: '100000.00',
        orderId: 'order-a',
        gateway: PaymentGatewayCode.MEGAPAY,
      });
      await registry.get(PaymentGatewayCode.SEPAY).createPayment({
        paymentReference: 'PAY-B',
        amount: '200000.00',
        orderId: 'order-b',
        gateway: PaymentGatewayCode.SEPAY,
      });

      expect(megapayCreate).toHaveBeenCalledTimes(1);
      expect(sepayCreate).toHaveBeenCalledTimes(1);
      expect(megapayCreate.mock.calls[0][0].paymentReference).toBe('PAY-A');
      expect(sepayCreate.mock.calls[0][0].paymentReference).toBe('PAY-B');
    });
  });

  describe('CHECK 3: Webhook replay attack', () => {
    it('same SUCCESS webhook processed once, replays return 200 duplicate', async () => {
      let paymentStatus: PaymentRecordStatus = PaymentRecordStatus.PENDING;
      const pendingPayment = {
        id: 'pay-1',
        orderId: 'order-1',
        gateway: PaymentGatewayCode.MEGAPAY,
        paymentReference: 'PAY-REPLAY-001',
        amount: new Decimal(100000),
        get status() {
          return paymentStatus;
        },
        expiresAt: new Date(Date.now() + 600_000),
        gatewayResponse: {},
        order: { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
      };

      const paymentRepository = {
        findByReference: jest.fn().mockImplementation(async () => ({
          ...pendingPayment,
          status: paymentStatus,
        })),
        findSuccessByProviderTransactionId: jest.fn().mockResolvedValue(null),
        claimPendingStatus: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValue({ count: 0 }),
      };
      const prisma = {
        $transaction: jest.fn(async (cb) =>
          cb({
            payment: {
              findUnique: jest.fn().mockResolvedValue({
                status: PaymentRecordStatus.SUCCESS,
              }),
            },
          }),
        ),
      };
      const orderService = { markPaidInTransaction: jest.fn() };
      const paymentAuditService = {
        recordPaymentSuccess: jest.fn(),
      };

      const service = new PaymentService(
        prisma as never,
        paymentRepository as never,
        { create: jest.fn() } as never,
        PaymentProviderRegistry.withProviders(
          new MockMegaPayProvider(),
          new MockSePayProvider(),
        ),
        orderService as never,
        paymentAuditService as never,
        { enqueueFulfillment: jest.fn() } as never,
        { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      );

      const payload = {
        paymentReference: 'PAY-REPLAY-001',
        status: 'SUCCESS',
        amount: '100000.00',
      };
      const headers = {
        'x-webhook-signature': computeMockWebhookSignature(payload),
      };

      const first = await service.handleWebhook('megapay', payload, headers);
      paymentStatus = PaymentRecordStatus.SUCCESS;
      const second = await service.handleWebhook('megapay', payload, headers);

      expect(first.ok).toBe(true);
      expect(first.duplicate).toBeFalsy();
      expect(second.duplicate).toBe(true);
      expect(orderService.markPaidInTransaction).toHaveBeenCalledTimes(1);
      expect(paymentAuditService.recordPaymentSuccess).toHaveBeenCalledTimes(1);
    });
  });

  describe('CHECK 4: Cross gateway protection', () => {
    it('rejects MegaPay webhook for SePay payment record', async () => {
      const paymentRepository = {
        findByReference: jest.fn().mockResolvedValue({
          id: 'pay-sepay',
          orderId: 'order-1',
          gateway: PaymentGatewayCode.SEPAY,
          paymentReference: 'PAY-CROSS-001',
          amount: new Decimal(100000),
          status: PaymentRecordStatus.PENDING,
          expiresAt: new Date(Date.now() + 600_000),
          gatewayResponse: {},
          order: { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
        }),
        findSuccessByProviderTransactionId: jest.fn(),
      };

      const service = new PaymentService(
        { $transaction: jest.fn() } as never,
        paymentRepository as never,
        { create: jest.fn() } as never,
        PaymentProviderRegistry.withProviders(
          new MockMegaPayProvider(),
          new MockSePayProvider(),
        ),
        {} as never,
        {} as never,
        { enqueueFulfillment: jest.fn() } as never,
        { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      );

      const payload = {
        paymentReference: 'PAY-CROSS-001',
        status: 'SUCCESS',
        amount: '100000.00',
      };

      await expect(
        service.handleWebhook('megapay', payload, {
          'x-webhook-signature': computeMockWebhookSignature(payload),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('CHECK 5: Amount validation', () => {
    function buildAmountTestService(gateway: 'megapay' | 'sepay') {
      const payment = {
        id: 'pay-amt',
        orderId: 'order-1',
        gateway:
          gateway === 'megapay'
            ? PaymentGatewayCode.MEGAPAY
            : PaymentGatewayCode.SEPAY,
        paymentReference: 'PAY-AMT-001',
        amount: new Decimal(100000),
        status: PaymentRecordStatus.PENDING,
        expiresAt: new Date(Date.now() + 600_000),
        gatewayResponse: {},
        order: { paymentStatus: OrderPaymentStatus.WAITING_PAYMENT },
      };

      return {
        service: new PaymentService(
          { $transaction: jest.fn() } as never,
          {
            findByReference: jest.fn().mockResolvedValue(payment),
            findSuccessByProviderTransactionId: jest.fn().mockResolvedValue(null),
          } as never,
          { create: jest.fn() } as never,
          PaymentProviderRegistry.withProviders(
            new MockMegaPayProvider(),
            new MockSePayProvider(),
          ),
          { markPaidInTransaction: jest.fn() } as never,
          {} as never,
          { enqueueFulfillment: jest.fn() } as never,
          { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
        ),
        payment,
      };
    }

    it('rejects MegaPay webhook with wrong amount', async () => {
      const { service } = buildAmountTestService('megapay');
      const payload = {
        paymentReference: 'PAY-AMT-001',
        status: 'SUCCESS',
        amount: '90000.00',
      };
      await expect(
        service.handleWebhook('megapay', payload, {
          'x-webhook-signature': computeMockWebhookSignature(payload),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects SePay webhook with wrong amount via mock gateway path', async () => {
      const { service } = buildAmountTestService('sepay');
      const payload = {
        paymentReference: 'PAY-AMT-001',
        status: 'SUCCESS',
        amount: '90000.00',
      };
      await expect(
        service.handleWebhook('sepay', payload, {
          'x-webhook-signature': computeMockWebhookSignature(payload),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('CHECK 6: Late payment handling', () => {
    it('documents MANUAL_REVIEW — order not PAID on expired late SUCCESS', () => {
      expect(PAYMENT_LATE_WEBHOOK_RULES.action).toBe('MANUAL_REVIEW');
      expect(PAYMENT_LATE_WEBHOOK_RULES.behavior.markOrderPaid).toBe(false);
      expect(PAYMENT_LATE_WEBHOOK_RULES.behavior.markPaymentSuccess).toBe(false);
      expect(PAYMENT_LATE_WEBHOOK_RULES.behavior.returnHttp200).toBe(true);
    });
  });

  describe('CHECK 7: Reconciliation readiness', () => {
    it('payments schema stores gateway, timestamps, and gatewayResponse JSON', () => {
      const schema = readFileSync(
        join(process.cwd(), 'prisma/schema.prisma'),
        'utf8',
      );
      expect(schema).toContain('gateway          PaymentGatewayCode');
      expect(schema).toContain('gatewayResponse  Json');
      expect(schema).toContain('paidAt           DateTime?');
      expect(schema).toContain('expiresAt        DateTime?');
      expect(schema).toContain('createdAt        DateTime');
    });

    it('success webhook merge stores normalized gatewayTransactionId', () => {
      const source = readFileSync(
        join(process.cwd(), 'src/modules/payment/services/payment.service.ts'),
        'utf8',
      );
      expect(source).toContain('gatewayTransactionId');
      expect(source).toContain('mergeGatewayResponseWithTransactionId');
    });
  });

  describe('CHECK 8: Security logging', () => {
    const providerFiles = [
      'src/modules/payment/providers/megapay/megapay.client.ts',
      'src/modules/payment/providers/megapay/megapay.provider.ts',
      'src/modules/payment/providers/sepay/sepay.provider.ts',
    ];

    it.each(providerFiles)('%s does not log secrets or signatures', (file) => {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/logger\.(log|debug|warn|error).*secret/i);
      expect(source).not.toMatch(/logger\.(log|debug|warn|error).*apiKey/i);
      expect(source).not.toMatch(/logger\.(log|debug|warn|error).*signature/i);
    });
  });

  describe('CHECK 9: Queue preparation', () => {
    it('documents payment success → provider_queue flow without worker implementation', () => {
      expect(PAYMENT_SUCCESS_QUEUE_RULES.queueName).toBe('provider_queue');
      expect(PAYMENT_SUCCESS_QUEUE_RULES.enqueueAfter).toContain(
        'payment SUCCESS',
      );
      expect(PAYMENT_SUCCESS_QUEUE_RULES.enqueueAfter).toContain('order PAID');
      expect(PAYMENT_SUCCESS_QUEUE_RULES.notImplementedInPhase).toContain(
        '2E.4',
      );
    });
  });
});
