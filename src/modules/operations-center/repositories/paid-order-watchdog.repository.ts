import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface PaidOrderWatchdogThresholds {
  pendingBefore: Date;
  processingBefore: Date;
  manualActionBefore: Date;
  take: number;
}

@Injectable()
export class PaidOrderWatchdogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAnomalies(thresholds: PaidOrderWatchdogThresholds) {
    return this.prisma.order.findMany({
      where: {
        deletedAt: null,
        paymentStatus: OrderPaymentStatus.PAID,
        OR: [
          {
            fulfillmentStatus: FulfillmentStatus.PENDING,
            updatedAt: { lte: thresholds.pendingBefore },
          },
          {
            fulfillmentStatus: FulfillmentStatus.PROCESSING,
            updatedAt: { lte: thresholds.processingBefore },
          },
          {
            fulfillmentStatus: {
              in: [
                FulfillmentStatus.WAITING_ADMIN_RETRY,
                FulfillmentStatus.NEED_MANUAL_REVIEW,
                FulfillmentStatus.FAILED,
              ],
            },
            updatedAt: { lte: thresholds.manualActionBefore },
          },
        ],
      },
      orderBy: { updatedAt: 'asc' },
      take: thresholds.take,
      select: {
        id: true,
        orderCode: true,
        channel: true,
        totalAmount: true,
        paymentMethodCode: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        updatedAt: true,
        providerTransactions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            requestId: true,
            status: true,
            errorCode: true,
            errorMessage: true,
            providerReference: true,
          },
        },
      },
    });
  }

  async hasRecentAlert(
    orderId: string,
    resource: string,
    since: Date,
  ): Promise<boolean> {
    const alert = await this.prisma.systemNotification.findFirst({
      where: {
        resource,
        resourceId: orderId,
        deletedAt: null,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    return alert !== null;
  }
}
