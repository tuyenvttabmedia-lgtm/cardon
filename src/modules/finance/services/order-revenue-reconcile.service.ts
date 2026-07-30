import { Injectable, Logger } from '@nestjs/common';
import {
  PaymentGatewayCode,
  PaymentRecordStatus,
  ProductVariantType,
  ReconcileDomain,
  SystemActivitySource,
  SystemNotificationSeverity,
  SystemNotificationType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { NotificationDispatcher } from '../../notification-center/services/notification-dispatcher.service';
import { PaymentProviderRegistry } from '../../payment/providers/payment-provider.registry';
import {
  detectOrderRevenueIssues,
  summarizeOrderRevenueIssues,
} from '../entities/order-revenue-reconcile.engine';
import { FinanceRepository } from '../repositories/finance.repository';

function vietnamDayBounds(reportDate: string): { start: Date; end: Date } {
  // reportDate is YYYY-MM-DD in Asia/Ho_Chi_Minh.
  const start = new Date(`${reportDate}T00:00:00+07:00`);
  const end = new Date(`${reportDate}T00:00:00+07:00`);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatVietnamDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function previousVietnamDate(now = new Date()): string {
  return formatVietnamDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

@Injectable()
export class OrderRevenueReconcileService {
  private readonly logger = new Logger(OrderRevenueReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly financeRepository: FinanceRepository,
    private readonly paymentProviders: PaymentProviderRegistry,
    private readonly notifications: NotificationDispatcher,
  ) {}

  runForPreviousDay(now = new Date()) {
    return this.runForDate(previousVietnamDate(now));
  }

  async runForDate(reportDate: string) {
    const { start, end } = vietnamDayBounds(reportDate);

    const [orders, payments] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          deletedAt: null,
          createdAt: { gte: start, lt: end },
        },
        take: 2000,
        orderBy: { createdAt: 'asc' },
        include: {
          activePayment: {
            select: {
              paymentReference: true,
              status: true,
              amount: true,
              gateway: true,
            },
          },
          orderItems: {
            select: { variant: { select: { type: true } } },
          },
          providerTransactions: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              requestId: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.payment.findMany({
        where: {
          deletedAt: null,
          OR: [
            { paidAt: { gte: start, lt: end } },
            {
              paidAt: null,
              updatedAt: { gte: start, lt: end },
              status: PaymentRecordStatus.SUCCESS,
            },
          ],
        },
        take: 2000,
        orderBy: { createdAt: 'asc' },
        include: {
          order: {
            select: {
              id: true,
              orderCode: true,
              paymentStatus: true,
              clientTrace: true,
            },
          },
        },
      }),
    ]);

    const orderInputs = orders.map((order) => {
      const trace =
        order.clientTrace &&
        typeof order.clientTrace === 'object' &&
        !Array.isArray(order.clientTrace)
          ? (order.clientTrace as { sandbox?: boolean })
          : {};
      return {
        id: order.id,
        orderCode: order.orderCode,
        channel: order.channel,
        paymentStatus: order.paymentStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        totalAmount: order.totalAmount.toFixed(2),
        paymentReference: order.activePayment?.paymentReference ?? null,
        paymentStatusRecord: order.activePayment?.status ?? null,
        hasCardOrTopupItem: order.orderItems.some((item) => {
          const type = item.variant.type;
          return (
            type === ProductVariantType.CARD ||
            type === ProductVariantType.TOPUP ||
            type === ProductVariantType.DATA
          );
        }),
        latestProviderStatus: order.providerTransactions[0]?.status ?? null,
        latestProviderRequestId:
          order.providerTransactions[0]?.requestId ?? null,
        isSandbox: trace.sandbox === true,
      };
    });

    const paymentInputs = payments.map((payment) => {
      const trace =
        payment.order.clientTrace &&
        typeof payment.order.clientTrace === 'object' &&
        !Array.isArray(payment.order.clientTrace)
          ? (payment.order.clientTrace as { sandbox?: boolean })
          : {};
      return {
        id: payment.id,
        paymentReference: payment.paymentReference,
        amount: payment.amount.toFixed(2),
        status: payment.status,
        orderId: payment.order.id,
        orderCode: payment.order.orderCode,
        orderPaymentStatus: payment.order.paymentStatus,
        isSandbox: trace.sandbox === true,
        gateway: payment.gateway,
      };
    });

    const megapaySuccess = paymentInputs.filter(
      (payment) =>
        payment.status === PaymentRecordStatus.SUCCESS &&
        payments.find((row) => row.id === payment.id)?.gateway ===
          PaymentGatewayCode.MEGAPAY,
    );

    const gatewayQueries = [];
    for (const payment of megapaySuccess.slice(0, 100)) {
      try {
        const queried = await this.paymentProviders
          .get(PaymentGatewayCode.MEGAPAY)
          .queryTransaction(payment.paymentReference);
        gatewayQueries.push({
          paymentReference: payment.paymentReference,
          gatewayStatus: queried.status,
          amount: queried.amount,
        });
      } catch (error) {
        this.logger.warn(
          `MegaPay query failed for ${payment.paymentReference}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const issues = detectOrderRevenueIssues({
      orders: orderInputs,
      payments: paymentInputs,
      gatewayQueries,
    });
    const summary = summarizeOrderRevenueIssues(issues);

    const report = await this.financeRepository.createReconcileReport({
      domain: ReconcileDomain.ORDER_REVENUE,
      gatewayOrProvider: 'CARDON_INTERNAL',
      reportDate: start,
      totalMatched: Math.max(
        0,
        orderInputs.length + paymentInputs.length - issues.length,
      ),
      totalMismatch: summary.mismatch,
      summary: {
        type: 'ORDER_REVENUE',
        reportDate,
        orderCount: orderInputs.length,
        paymentCount: paymentInputs.length,
        gatewayQueryCount: gatewayQueries.length,
        ...summary,
      },
      items: issues.map((issue) => ({
        matchStatus: issue.matchStatus,
        reference: issue.reference,
        localAmount: issue.localAmount,
        externalAmount: issue.externalAmount,
      })),
    });

    if (issues.length > 0) {
      this.notifications.dispatch({
        title: `Đối soát ngày ${reportDate}: ${issues.length} lệch`,
        message: `Phát hiện ${issues.length} lệch Order/Payment/Provider/MegaPay. Báo cáo ${report.id}.`,
        notificationType: SystemNotificationType.FINANCE,
        severity: SystemNotificationSeverity.ERROR,
        source: SystemActivitySource.CRON,
        resource: 'order_revenue_reconcile',
        resourceId: report.id,
        resourceDisplay: reportDate,
        targetRoles: [
          UserRole.SUPER_ADMIN,
          UserRole.ADMIN,
          UserRole.ACCOUNTANT,
        ],
        metadata: {
          reportDate,
          reportId: report.id,
          ...summary,
        },
      });
    }

    this.logger.log(
      `Order-revenue reconcile ${reportDate}: orders=${orderInputs.length} payments=${paymentInputs.length} issues=${issues.length}`,
    );

    return {
      reportId: report.id,
      reportDate,
      summary: {
        orderCount: orderInputs.length,
        paymentCount: paymentInputs.length,
        gatewayQueryCount: gatewayQueries.length,
        ...summary,
      },
      issues,
    };
  }
}
