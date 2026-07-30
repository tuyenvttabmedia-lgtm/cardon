import { Injectable, Logger } from '@nestjs/common';
import {
  FulfillmentStatus,
  SystemActivitySource,
  SystemNotificationSeverity,
  SystemNotificationType,
  UserRole,
} from '@prisma/client';
import { NotificationDispatcher } from '../../notification-center/services/notification-dispatcher.service';
import { PaidOrderWatchdogRepository } from '../repositories/paid-order-watchdog.repository';

const MINUTE_MS = 60 * 1000;
const PENDING_GRACE_MS = 10 * MINUTE_MS;
const PROCESSING_GRACE_MS = 15 * MINUTE_MS;
const MANUAL_ACTION_GRACE_MS = 5 * MINUTE_MS;
const ALERT_COOLDOWN_MS = 6 * 60 * MINUTE_MS;
const SCAN_LIMIT = 100;

interface PaidOrderAnomaly {
  id: string;
  orderCode: string;
  fulfillmentStatus: FulfillmentStatus;
  updatedAt: Date;
  totalAmount: { toString(): string };
  paymentMethodCode: string | null;
  channel: string;
  providerTransactions: Array<{
    requestId: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    providerReference: string | null;
  }>;
}

export interface PaidOrderWatchdogResult {
  scanned: number;
  alerted: number;
  suppressed: number;
}

@Injectable()
export class PaidOrderWatchdogService {
  private readonly logger = new Logger(PaidOrderWatchdogService.name);

  constructor(
    private readonly repository: PaidOrderWatchdogRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async scan(now = new Date()): Promise<PaidOrderWatchdogResult> {
    const orders = await this.repository.findAnomalies({
      pendingBefore: new Date(now.getTime() - PENDING_GRACE_MS),
      processingBefore: new Date(now.getTime() - PROCESSING_GRACE_MS),
      manualActionBefore: new Date(now.getTime() - MANUAL_ACTION_GRACE_MS),
      take: SCAN_LIMIT,
    });

    let alerted = 0;
    let suppressed = 0;
    const cooldownStart = new Date(now.getTime() - ALERT_COOLDOWN_MS);

    for (const order of orders as PaidOrderAnomaly[]) {
      const alert = this.describe(order, now);
      const duplicate = await this.repository.hasRecentAlert(
        order.id,
        alert.resource,
        cooldownStart,
      );
      if (duplicate) {
        suppressed += 1;
        continue;
      }

      this.notifications.dispatch({
        title: alert.title,
        message: alert.message,
        notificationType: SystemNotificationType.ORDER,
        severity: alert.severity,
        source: SystemActivitySource.CRON,
        resource: alert.resource,
        resourceId: order.id,
        resourceDisplay: order.orderCode,
        targetRoles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.SUPPORT],
        metadata: {
          watchdog: 'paid-order-fulfillment',
          orderCode: order.orderCode,
          paymentStatus: 'PAID',
          fulfillmentStatus: order.fulfillmentStatus,
          paymentMethodCode: order.paymentMethodCode,
          ageMinutes: alert.ageMinutes,
          latestProviderRequestId: order.providerTransactions[0]?.requestId ?? null,
          latestProviderStatus: order.providerTransactions[0]?.status ?? null,
          latestProviderReference:
            order.providerTransactions[0]?.providerReference ?? null,
          latestProviderErrorCode:
            order.providerTransactions[0]?.errorCode ?? null,
        },
      });
      alerted += 1;
    }

    if (alerted > 0) {
      this.logger.warn(
        `Paid-order watchdog alerted=${alerted} suppressed=${suppressed} scanned=${orders.length}`,
      );
    }

    return { scanned: orders.length, alerted, suppressed };
  }

  private describe(order: PaidOrderAnomaly, now: Date) {
    const ageMinutes = Math.max(
      0,
      Math.floor((now.getTime() - order.updatedAt.getTime()) / MINUTE_MS),
    );
    const latest = order.providerTransactions[0];
    const providerDetail = [
      latest?.errorCode,
      latest?.errorMessage,
      latest?.requestId ? `request ${latest.requestId}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const suffix = providerDetail ? ` NCC: ${providerDetail}.` : '';

    switch (order.fulfillmentStatus) {
      case FulfillmentStatus.PENDING:
        return {
          resource: 'order_fulfillment_stuck_pending',
          severity: SystemNotificationSeverity.ERROR,
          title: `Đơn đã thu tiền chưa vào xử lý: ${order.orderCode}`,
          message: `Đơn đã PAID nhưng còn PENDING ${ageMinutes} phút. Kiểm tra queue fulfillment.${suffix}`,
          ageMinutes,
        };
      case FulfillmentStatus.PROCESSING:
        return {
          resource: 'order_fulfillment_stuck_processing',
          severity: SystemNotificationSeverity.ERROR,
          title: `Đơn xử lý quá lâu: ${order.orderCode}`,
          message: `Đơn đã PAID và PROCESSING ${ageMinutes} phút. Chỉ kiểm tra giao dịch NCC trước khi retry.${suffix}`,
          ageMinutes,
        };
      case FulfillmentStatus.WAITING_ADMIN_RETRY:
        return {
          resource: 'order_fulfillment_waiting_admin_retry',
          severity: SystemNotificationSeverity.ERROR,
          title: `Đơn cần admin giao lại: ${order.orderCode}`,
          message: `Đơn đã thu tiền đang WAITING_ADMIN_RETRY ${ageMinutes} phút. Không tự động hoàn tiền; kiểm tra trạng thái NCC trước khi giao lại.${suffix}`,
          ageMinutes,
        };
      case FulfillmentStatus.NEED_MANUAL_REVIEW:
        return {
          resource: 'order_fulfillment_manual_review',
          severity: SystemNotificationSeverity.CRITICAL,
          title: `Đơn đã thu tiền cần rà soát: ${order.orderCode}`,
          message: `Đơn PAID đang NEED_MANUAL_REVIEW ${ageMinutes} phút. Cần xử lý thủ công.${suffix}`,
          ageMinutes,
        };
      default:
        return {
          resource: 'order_fulfillment_failed_after_payment',
          severity: SystemNotificationSeverity.CRITICAL,
          title: `Đơn đã thu tiền nhưng fulfillment thất bại: ${order.orderCode}`,
          message: `Đơn PAID đang FAILED ${ageMinutes} phút. Không hoàn tiền tự động; cần kiểm tra NCC và lịch sử giao dịch.${suffix}`,
          ageMinutes,
        };
    }
  }
}
