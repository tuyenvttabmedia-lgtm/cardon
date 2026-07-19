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
