import { Injectable } from '@nestjs/common';
import {
  FulfillmentStatus,
  OrderPaymentStatus,
  PaymentRecordStatus,
  Prisma,
  ProductVariantType,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface PaidOrderWatchdogThresholds {
  pendingBefore: Date;
  processingBefore: Date;
  manualActionBefore: Date;
  paymentSuccessBefore: Date;
  take: number;
}

const NOT_SANDBOX: Prisma.OrderWhereInput = {
  NOT: {
    clientTrace: {
      path: ['sandbox'],
      equals: true,
    },
  },
};

@Injectable()
export class PaidOrderWatchdogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAnomalies(thresholds: PaidOrderWatchdogThresholds) {
    return this.prisma.order.findMany({
      where: {
        deletedAt: null,
        paymentStatus: OrderPaymentStatus.PAID,
        ...NOT_SANDBOX,
        OR: [
          {
            fulfillmentStatus: FulfillmentStatus.PENDING,
            OR: [
              { activePayment: { paidAt: { lte: thresholds.pendingBefore } } },
              {
                activePayment: null,
                createdAt: { lte: thresholds.pendingBefore },
              },
            ],
          },
          {
            fulfillmentStatus: FulfillmentStatus.PROCESSING,
            OR: [
              {
                providerTransactions: {
                  some: {
                    deletedAt: null,
                    createdAt: { lte: thresholds.processingBefore },
                  },
                },
              },
              {
                providerTransactions: { none: { deletedAt: null } },
                createdAt: { lte: thresholds.processingBefore },
              },
            ],
          },
          {
            fulfillmentStatus: {
              in: [
                FulfillmentStatus.WAITING_ADMIN_RETRY,
                FulfillmentStatus.NEED_MANUAL_REVIEW,
                FulfillmentStatus.FAILED,
              ],
            },
            OR: [
              {
                activePayment: {
                  paidAt: { lte: thresholds.manualActionBefore },
                },
              },
              {
                activePayment: null,
                createdAt: { lte: thresholds.manualActionBefore },
              },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: thresholds.take,
      select: this.orderSelect(),
    });
  }

  /**
   * PAID + PENDING long enough to re-dispatch (sweeper). CARD/TOPUP/DATA only.
   * Excludes sandbox and eSIM-only (eSIM has its own path).
   */
  findPaidPendingForSweep(params: {
    paidBefore: Date;
    take: number;
  }) {
    return this.prisma.order.findMany({
      where: {
        deletedAt: null,
        paymentStatus: OrderPaymentStatus.PAID,
        fulfillmentStatus: FulfillmentStatus.PENDING,
        ...NOT_SANDBOX,
        OR: [
          { activePayment: { paidAt: { lte: params.paidBefore } } },
          {
            activePayment: null,
            createdAt: { lte: params.paidBefore },
          },
        ],
        orderItems: {
          some: {
            variant: {
              type: {
                in: [
                  ProductVariantType.CARD,
                  ProductVariantType.TOPUP,
                  ProductVariantType.DATA,
                ],
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: params.take,
      select: {
        id: true,
        orderCode: true,
        createdAt: true,
        activePayment: { select: { paidAt: true } },
      },
    });
  }

  findPaymentSuccessOrderNotPaid(thresholds: PaidOrderWatchdogThresholds) {
    return this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        status: PaymentRecordStatus.SUCCESS,
        paidAt: { lte: thresholds.paymentSuccessBefore },
        order: {
          deletedAt: null,
          paymentStatus: { not: OrderPaymentStatus.PAID },
          ...NOT_SANDBOX,
        },
      },
      orderBy: { paidAt: 'asc' },
      take: thresholds.take,
      select: {
        id: true,
        paymentReference: true,
        paidAt: true,
        amount: true,
        methodCode: true,
        order: {
          select: {
            id: true,
            orderCode: true,
            channel: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            paymentMethodCode: true,
            createdAt: true,
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

  private orderSelect() {
    return {
      id: true,
      orderCode: true,
      channel: true,
      totalAmount: true,
      paymentMethodCode: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      createdAt: true,
      updatedAt: true,
      financialTransaction: {
        select: { status: true },
      },
      activePayment: {
        select: { paidAt: true },
      },
      orderItems: {
        select: {
          variant: {
            select: { type: true },
          },
        },
      },
      providerTransactions: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
        select: {
          requestId: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          providerReference: true,
          createdAt: true,
        },
      },
    };
  }
}
