import {
  FulfillmentStatus,
  OrderChannel,
  OrderPaymentStatus,
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
    hasRecentAlert: jest.Mock;
  };
  let notifications: { dispatch: jest.Mock };
  let service: PaidOrderWatchdogService;

  beforeEach(() => {
    repository = {
      findAnomalies: jest.fn(),
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
    expect(result).toEqual({ scanned: 1, alerted: 1, suppressed: 0 });
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
    expect(result).toEqual({ scanned: 1, alerted: 0, suppressed: 1 });
  });

  function buildOrder(status: FulfillmentStatus, ageMinutes: number) {
    return {
      id: 'order-1',
      orderCode: 'ORD-20260731-TEST01',
      channel: OrderChannel.B2C,
      totalAmount: new Decimal(100_000),
      paymentMethodCode: 'VNPAYQR',
      paymentStatus: OrderPaymentStatus.PAID,
      fulfillmentStatus: status,
      updatedAt: new Date(now.getTime() - ageMinutes * 60_000),
      providerTransactions: [
        {
          requestId: 'PRV-TEST-1',
          status: 'TIMEOUT',
          errorCode: 'TIMEOUT',
          errorMessage: 'Provider timeout',
          providerReference: 'ESALE-1',
        },
      ],
    };
  }
});
