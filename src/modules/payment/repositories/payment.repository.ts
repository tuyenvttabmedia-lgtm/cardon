import { Injectable } from '@nestjs/common';
import {
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
  WebhookSource,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ACTIVE_PAYMENT_WHERE } from '../entities/payment.constants';

export interface CreatePaymentRecordInput {
  orderId: string;
  gateway: PaymentGatewayCode;
  paymentReference: string;
  idempotencyKey: string;
  amount: Prisma.Decimal;
  expiresAt: Date;
  gatewayResponse: Prisma.InputJsonValue;
}

@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.payment.findFirst({
      where: { idempotencyKey, ...ACTIVE_PAYMENT_WHERE },
    });
  }

  findByReference(paymentReference: string) {
    return this.prisma.payment.findFirst({
      where: { paymentReference, ...ACTIVE_PAYMENT_WHERE },
      include: { order: true },
    });
  }

  findById(id: string) {
    return this.prisma.payment.findFirst({
      where: { id, ...ACTIVE_PAYMENT_WHERE },
      include: { order: true },
    });
  }

  findLatestByOrderId(orderId: string) {
    return this.prisma.payment.findFirst({
      where: { orderId, ...ACTIVE_PAYMENT_WHERE },
      include: { order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findPendingExpired(now: Date) {
    return this.prisma.payment.findMany({
      where: {
        status: PaymentRecordStatus.PENDING,
        expiresAt: { lt: now },
        ...ACTIVE_PAYMENT_WHERE,
      },
      select: { id: true, orderId: true, paymentReference: true },
    });
  }

  create(data: CreatePaymentRecordInput) {
    return this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        gateway: data.gateway,
        paymentReference: data.paymentReference,
        idempotencyKey: data.idempotencyKey,
        amount: data.amount,
        status: PaymentRecordStatus.PENDING,
        expiresAt: data.expiresAt,
        gatewayResponse: data.gatewayResponse,
      },
    });
  }

  updateStatus(
    id: string,
    status: PaymentRecordStatus,
    extra?: { paidAt?: Date; gatewayResponse?: Prisma.InputJsonValue },
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.payment.update({
      where: { id },
      data: {
        status,
        paidAt: extra?.paidAt,
        gatewayResponse: extra?.gatewayResponse,
      },
    });
  }

  /** Atomic claim — only one concurrent webhook can transition PENDING → target. */
  claimPendingStatus(
    id: string,
    targetStatus: PaymentRecordStatus,
    extra: { paidAt?: Date; gatewayResponse?: Prisma.InputJsonValue },
    tx: Prisma.TransactionClient,
  ) {
    return tx.payment.updateMany({
      where: {
        id,
        status: PaymentRecordStatus.PENDING,
        deletedAt: null,
      },
      data: {
        status: targetStatus,
        paidAt: extra.paidAt,
        gatewayResponse: extra.gatewayResponse,
      },
    });
  }

  /**
   * Mark every other PENDING payment on the order as EXPIRED so reopen / recreate
   * leaves a single active invoice. Late SUCCESS on superseded refs → manual review.
   */
  async expireOtherPendingForOrder(
    orderId: string,
    keepPaymentId: string,
    meta: { supersededBy: string; reason: string },
    tx: Prisma.TransactionClient,
  ): Promise<{
    count: number;
    expired: Array<{
      id: string;
      gateway: PaymentGatewayCode;
      paymentReference: string;
    }>;
  }> {
    const others = await tx.payment.findMany({
      where: {
        orderId,
        id: { not: keepPaymentId },
        status: PaymentRecordStatus.PENDING,
        deletedAt: null,
      },
      select: {
        id: true,
        gateway: true,
        paymentReference: true,
        gatewayResponse: true,
      },
    });
    if (others.length === 0) return { count: 0, expired: [] };

    const supersededAt = new Date().toISOString();
    const expired: Array<{
      id: string;
      gateway: PaymentGatewayCode;
      paymentReference: string;
    }> = [];
    for (const row of others) {
      const existing =
        row.gatewayResponse &&
        typeof row.gatewayResponse === 'object' &&
        !Array.isArray(row.gatewayResponse)
          ? (row.gatewayResponse as Record<string, unknown>)
          : {};
      // Re-check PENDING so a concurrent SUCCESS IPN is never overwritten to EXPIRED.
      const claim = await tx.payment.updateMany({
        where: {
          id: row.id,
          status: PaymentRecordStatus.PENDING,
          deletedAt: null,
        },
        data: {
          status: PaymentRecordStatus.EXPIRED,
          gatewayResponse: {
            ...existing,
            supersededAt,
            supersededBy: meta.supersededBy,
            supersedeReason: meta.reason,
          } as Prisma.InputJsonValue,
        },
      });
      if (claim.count > 0) {
        expired.push({
          id: row.id,
          gateway: row.gateway,
          paymentReference: row.paymentReference,
        });
      }
    }
    return { count: expired.length, expired };
  }

  countPendingForOrder(
    orderId: string,
    tx?: Prisma.TransactionClient,
    excludePaymentId?: string,
  ) {
    const client = tx ?? this.prisma;
    return client.payment.count({
      where: {
        orderId,
        status: PaymentRecordStatus.PENDING,
        deletedAt: null,
        ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
      },
    });
  }

  recordLateWebhookManualReview(
    id: string,
    gatewayResponse: Prisma.InputJsonValue,
  ) {
    return this.prisma.payment.update({
      where: { id },
      data: { gatewayResponse },
    });
  }

  findManualReviewPayments() {
    return this.prisma.payment.findMany({
      where: {
        ...ACTIVE_PAYMENT_WHERE,
        gatewayResponse: {
          path: ['manualReview'],
          equals: true,
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderCode: true,
            paymentStatus: true,
            totalAmount: true,
            guestEmail: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  updateGatewayResponse(id: string, gatewayResponse: Prisma.InputJsonValue) {
    return this.prisma.payment.update({
      where: { id },
      data: { gatewayResponse },
    });
  }

  findSuccessByProviderTransactionId(
    gateway: PaymentGatewayCode,
    providerTransactionId: string,
  ) {
    return this.prisma.payment.findFirst({
      where: {
        gateway,
        status: PaymentRecordStatus.SUCCESS,
        deletedAt: null,
        gatewayResponse: {
          path: ['gatewayTransactionId'],
          equals: providerTransactionId,
        },
      },
    });
  }
}

@Injectable()
export class WebhookLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(params: {
    source: WebhookSource;
    paymentReference: string;
    payload: Prisma.InputJsonValue;
    signatureValid: boolean;
    ipAddress?: string;
    processed: boolean;
  }) {
    return this.prisma.webhookLog.create({
      data: params,
    });
  }

  findUnprocessedWebhooks(take = 50) {
    return this.prisma.webhookLog.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  markProcessed(id: string) {
    return this.prisma.webhookLog.update({
      where: { id },
      data: { processed: true },
    });
  }
}
