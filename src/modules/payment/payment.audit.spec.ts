/**
 * Phase 2E.1 — Payment Safety Audit Tests
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
import {
  PAYMENT_LATE_WEBHOOK_RULES,
  PAYMENT_REFUND_RULES,
} from './entities/payment-refund.rules';
import {
  assertWebhookAmountMatches,
  isWebhookPaymentExpired,
} from './entities/payment-state.machine';
import { PaymentRepository } from './repositories/payment.repository';
import { PaymentService } from './services/payment.service';
import { computeMockWebhookSignature, MockMegaPayProvider, MockSePayProvider } from './providers/mock-payment.providers';
import { PaymentProviderRegistry } from './providers/payment-provider.registry';

function testRegistry(): PaymentProviderRegistry {
  return PaymentProviderRegistry.withProviders(
    new MockMegaPayProvider(),
    new MockSePayProvider(),
  );
}

describe('Phase 2E.1 Payment Safety Audit', () => {
  describe('CHECK 1: Webhook duplicate protection', () => {
    it('second SUCCESS webhook returns duplicate without audit', async () => {
      const paymentRepository = {
        findByReference: jest.fn().mockResolvedValue({
          id: 'pay-1',
          orderId: 'order-1',
          gateway: PaymentGatewayCode.MEGAPAY,
          paymentReference: 'PAY-1',
          status: PaymentRecordStatus.SUCCESS,
          order: { paymentStatus: OrderPaymentStatus.PAID },
        }),
      };
      const paymentAuditService = {
        recordDuplicateWebhook: jest.fn(),
        recordPaymentSuccess: jest.fn(),
      };
      const service = new PaymentService(
        { $transaction: jest.fn() } as never,
        paymentRepository as never,
        { create: jest.fn() } as never,
        testRegistry(),
        { markPaidInTransaction: jest.fn() } as never,
        paymentAuditService as never,
        { enqueueFulfillment: jest.fn() } as never,
        { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      );

      const payload = { paymentReference: 'PAY-1', status: 'SUCCESS' };
      const result = await service.handleWebhook(
        'megapay',
        payload,
        { 'x-webhook-signature': computeMockWebhookSignature(payload) },
      );

      expect(result.duplicate).toBe(true);
      expect(paymentAuditService.recordDuplicateWebhook).not.toHaveBeenCalled();
      expect(paymentAuditService.recordPaymentSuccess).not.toHaveBeenCalled();
    });
  });

  describe('CHECK 2: Payment amount validation', () => {
    it('rejects 90000 webhook for 100000 order', () => {
      expect(() =>
        assertWebhookAmountMatches(new Decimal(100000), '90000.00'),
      ).toThrow(BadRequestException);
    });

    it('accepts matching amount', () => {
      expect(() =>
        assertWebhookAmountMatches(new Decimal(100000), '100000.00'),
      ).not.toThrow();
    });
  });

  describe('CHECK 3: Expired payment late SUCCESS', () => {
    it('detects expired context', () => {
      expect(
        isWebhookPaymentExpired({
          paymentStatus: PaymentRecordStatus.EXPIRED,
          orderPaymentStatus: OrderPaymentStatus.EXPIRED,
          expiresAt: new Date('2020-01-01'),
        }),
      ).toBe(true);
    });

    it('documents MANUAL_REVIEW handling', () => {
      expect(PAYMENT_LATE_WEBHOOK_RULES.action).toBe('MANUAL_REVIEW');
      expect(PAYMENT_LATE_WEBHOOK_RULES.behavior.markOrderPaid).toBe(false);
    });
  });

  describe('CHECK 4: Invalid webhook', () => {
    it('rejects wrong signature', async () => {
      const service = new PaymentService(
        {} as never,
        { findByReference: jest.fn() } as never,
        { create: jest.fn() } as never,
        testRegistry(),
        {} as never,
        {} as never,
        { enqueueFulfillment: jest.fn() } as never,
        { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      );
      await expect(
        service.handleWebhook(
          'megapay',
          { paymentReference: 'PAY-1', status: 'SUCCESS' },
          { 'x-webhook-signature': 'bad' },
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects unknown payment_reference', async () => {
      const service = new PaymentService(
        {} as never,
        { findByReference: jest.fn().mockResolvedValue(null) } as never,
        { create: jest.fn() } as never,
        testRegistry(),
        {} as never,
        {} as never,
        { enqueueFulfillment: jest.fn() } as never,
        { notifyPaymentSuccess: jest.fn(), notifyManualPaymentReview: jest.fn() } as never,
      );
      const payload = { paymentReference: 'UNKNOWN', status: 'SUCCESS' };
      await expect(
        service.handleWebhook(
          'megapay',
          payload,
          { 'x-webhook-signature': computeMockWebhookSignature(payload) },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('CHECK 5: Race condition — atomic claim', () => {
    it('claimPendingStatus uses updateMany with PENDING filter', async () => {
      const prisma = {
        payment: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      const repo = new PaymentRepository(prisma as never);
      await repo.claimPendingStatus(
        'pay-1',
        PaymentRecordStatus.SUCCESS,
        { paidAt: new Date(), gatewayResponse: {} },
        prisma as never,
      );
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'pay-1',
            status: PaymentRecordStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('CHECK 7: payment_reference uniqueness', () => {
    it('schema defines paymentReference as unique', () => {
      const schema = require('fs').readFileSync(
        require('path').join(process.cwd(), 'prisma/schema.prisma'),
        'utf8',
      );
      expect(schema).toContain('paymentReference String              @unique');
    });
  });

  describe('CHECK 8: Refund preparation', () => {
    it('documents future REFUND_PENDING and REFUNDED', () => {
      expect(PAYMENT_REFUND_RULES.futureOrderStatuses).toContain('REFUND_PENDING');
      expect(PAYMENT_REFUND_RULES.futureOrderStatuses).toContain('REFUNDED');
    });
  });
});
