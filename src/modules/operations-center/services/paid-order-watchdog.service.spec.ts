import {
  FinancialTransactionStatus,
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
  ProductVariantType,
  SystemNotificationSeverity,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { NotificationDispatcher } from '../../notification-center/services/notification-dispatcher.service';
import { PaidOrderWatchdogRepository } from '../repositories/paid-order-watchdog.repository';
import { PaidOrderWatchdogService } from './paid-order-watchdog.service';

describe('PaidOrderWatchdogService', () => {
  const now = new Date('2026-07-31T00:00:00.000Z');
  let repository: {
    findAnomalies: jest.Mock;
    findPaymentSuccessOrderNotPaid: jest.Mock;
    hasRecentAlert: jest.Mock;
  };
  let notifications: { dispatch: jest.Mock };
  let service: PaidOrderWatchdogService;

  beforeEach(() => {
    repository = {
      findAnomalies: jest.fn().mockResolvedValue([]),
      findPaymentSuccessOrderNotPaid: jest.fn().mockResolvedValue([]),
      hasRecentAlert: jest.fn().mockResolvedValue(false),
    };
    notifications = { dispatch: jest.fn() };
    service = new PaidOrderWatchdogService(
      repository as unknown as PaidOrderWatchdogRepository,
      notifications as unknown as NotificationDispatcher,
    );
  });

  it('alerts when a paid order remains pending beyond the grace period', async () => {
    repository.findAnomalies.mockResolvedValue([
      buildOrder(FulfillmentStatus.PENDING, 12),
    ]);

    const result = await service.scan(now);

    expect(repository.findAnomalies).toHaveBeenCalledWith({
      pendingBefore: new Date('2026-07-30T23:50:00.000Z'),
      processingBefore: new Date('2026-07-30T23:45:00.000Z'),
      manualActionBefore: new Date('2026-07-30T23:55:00.000Z'),
      paymentSuccessBefore: new Date('2026-07-30T23:50:00.000Z'),
      take: 100,
    });
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: SystemNotificationSeverity.ERROR,
        resource: 'order_fulfillment_stuck_pending',
        resourceId: 'order-1',
        metadata: expect.objectContaining({
          paymentStatus: 'PAID',
          fulfillmentStatus: FulfillmentStatus.PENDING,
          ageMinutes: 12,
        }),
      }),
    );
    expect(result).toEqual({
      scanned: 1,
      alerted: 1,
      suppressed: 0,
      skipped: 0,
    });
  });

  it('raises a critical alert for a paid order needing manual review', async () => {
    repository.findAnomalies.mockResolvedValue([
      buildOrder(FulfillmentStatus.NEED_MANUAL_REVIEW, 8),
    ]);

    await service.scan(now);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: SystemNotificationSeverity.CRITICAL,
        resource: 'order_fulfillment_manual_review',
      }),
    );
  });

  it('suppresses the same alert during the six-hour cooldown', async () => {
    repository.findAnomalies.mockResolvedValue([
      buildOrder(FulfillmentStatus.WAITING_ADMIN_RETRY, 20),
    ]);
    repository.hasRecentAlert.mockResolvedValue(true);

    const result = await service.scan(now);

    expect(repository.hasRecentAlert).toHaveBeenCalledWith(
      'order-1',
      'order_fulfillment_waiting_admin_retry',
      new Date('2026-07-30T18:00:00.000Z'),
    );
    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 1,
      alerted: 0,
      suppressed: 1,
      skipped: 0,
    });
  });

  it('skips agent failures after the hold was released', async () => {
    repository.findAnomalies.mockResolvedValue([
      {
        ...buildOrder(FulfillmentStatus.FAILED, 30),
        channel: OrderChannel.AGENT,
        financialTransaction: {
          status: FinancialTransactionStatus.RELEASED,
        },
      },
    ]);

    const result = await service.scan(now);

    expect(notifications.dispatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 1,
      alerted: 0,
      suppressed: 0,
      skipped: 1,
    });
  });

  it('uses a softer alert when a paid order has no dispatchable item', async () => {
    repository.findAnomalies.mockResolvedValue([
      {
        ...buildOrder(FulfillmentStatus.PENDING, 40),
        orderItems: [{ variant: { type: 'UNKNOWN' } }],
      },
    ]);

    await service.scan(now);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: SystemNotificationSeverity.WARNING,
        resource: 'order_fulfillment_no_dispatchable_item',
      }),
    );
  });

  it('alerts when payment is SUCCESS but the order is still not PAID', async () => {
    repository.findPaymentSuccessOrderNotPaid.mockResolvedValue([
      {
        id: 'pay-1',
        paymentReference: 'PAY-TEST-1',
        paidAt: new Date(now.getTime() - 15 * 60_000),
        amount: new Decimal(100_000),
        methodCode: 'VNPAYQR',
        order: {
          id: 'order-orphan-1',
          orderCode: 'ORD-20260731-ORPHAN',
          channel: OrderChannel.B2C,
          paymentStatus: OrderPaymentStatus.WAITING_PAYMENT,
          fulfillmentStatus: FulfillmentStatus.PENDING,
          paymentMethodCode: 'VNPAYQR',
          createdAt: new Date(now.getTime() - 20 * 60_000),
        },
      },
    ]);

    const result = await service.scan(now);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: SystemNotificationSeverity.CRITICAL,
        resource: 'payment_success_order_not_paid',
        resourceId: 'order-orphan-1',
      }),
    );
    expect(result.alerted).toBe(1);
  });

  function buildOrder(status: FulfillmentStatus, ageMinutes: number) {
    const paidAt = new Date(now.getTime() - ageMinutes * 60_000);
    return {
      id: 'order-1',
      orderCode: 'ORD-20260731-TEST01',
      channel: OrderChannel.B2C,
      totalAmount: new Decimal(100_000),
      paymentMethodCode: 'VNPAYQR',
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: status,
      createdAt: paidAt,
      updatedAt: paidAt,
      financialTransaction: { status: FinancialTransactionStatus.PENDING },
      activePayment: { paidAt },
      orderItems: [{ variant: { type: ProductVariantType.CARD } }],
      providerTransactions: [
        {
          requestId: 'PRV-TEST-1',
          status: 'TIMEOUT',
          errorCode: 'TIMEOUT',
          errorMessage: 'Provider timeout',
          providerReference: 'ESALE-1',
          createdAt: paidAt,
        },
      ],
    };
  }
});
