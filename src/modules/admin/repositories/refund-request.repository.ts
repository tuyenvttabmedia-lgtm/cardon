import { Injectable } from '@nestjs/common';
import {
  Prisma,
  RefundAttemptStatus,
  RefundCurrency,
  RefundEsimGate,
  RefundIntendedMethod,
  RefundReconStatus,
  RefundRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';

@Injectable()
export class RefundRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  lockPaymentForUpdate(paymentId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE id = ${paymentId}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
  }

  lockRequestForUpdate(requestId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM refund_requests WHERE id = ${requestId}::uuid FOR UPDATE
    `;
  }

  lockAttemptForUpdate(attemptId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM refund_attempts WHERE id = ${attemptId}::uuid FOR UPDATE
    `;
  }

  lockOrderForUpdate(orderId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM orders WHERE id = ${orderId}::uuid AND deleted_at IS NULL FOR UPDATE
    `;
  }

  findPaymentById(paymentId: string, tx: Prisma.TransactionClient) {
    return tx.payment.findFirst({
      where: { id: paymentId, deletedAt: null },
    });
  }

  listRequestsForPayment(paymentId: string, tx: Prisma.TransactionClient) {
    return tx.refundRequest.findMany({
      where: { paymentId },
      include: { attempts: true },
    });
  }

  listRequestsForPaymentRead(paymentId: string) {
    return this.prisma.refundRequest.findMany({
      where: { paymentId },
      include: { attempts: true },
    });
  }

  findOrderHeader(orderId: string, tx: Prisma.TransactionClient) {
    return tx.order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { id: true, fulfillmentStatus: true, paymentStatus: true },
    });
  }

  listSuccessPaymentsForOrder(orderId: string, tx: Prisma.TransactionClient) {
    return tx.payment.findMany({
      where: { orderId, deletedAt: null, status: 'SUCCESS' },
      orderBy: { id: 'asc' },
    });
  }

  listRequestsForOrder(orderId: string, tx: Prisma.TransactionClient) {
    return tx.refundRequest.findMany({
      where: { orderId },
      include: { attempts: true },
    });
  }

  updateOrderPaymentStatus(
    orderId: string,
    paymentStatus: 'REFUNDED',
    tx: Prisma.TransactionClient,
  ) {
    return tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
      select: { id: true, paymentStatus: true, fulfillmentStatus: true },
    });
  }

  createRequest(
    data: {
      orderId: string;
      paymentId: string;
      amount: Prisma.Decimal;
      currency: RefundCurrency;
      reason: string;
      intendedMethod: RefundIntendedMethod;
      esimGate: RefundEsimGate;
      requestedById: string;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.refundRequest.create({
      data: {
        orderId: data.orderId,
        paymentId: data.paymentId,
        amount: data.amount,
        currency: data.currency,
        reason: data.reason,
        status: RefundRequestStatus.REQUESTED,
        intendedMethod: data.intendedMethod,
        esimGate: data.esimGate,
        requestedById: data.requestedById,
      },
    });
  }

  findRequestById(id: string, tx: Prisma.TransactionClient) {
    return tx.refundRequest.findUnique({
      where: { id },
      include: { attempts: true, payment: true },
    });
  }

  updateRequest(
    id: string,
    data: Prisma.RefundRequestUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.refundRequest.update({
      where: { id },
      data,
    });
  }

  async loadEsimGateSources(orderId: string, tx: Prisma.TransactionClient) {
    const items = await tx.orderItem.findMany({
      where: { orderId },
      select: {
        esimProfile: { select: { id: true } },
        esimAttempts: {
          select: {
            operation: true,
            outcome: true,
            providerReference: true,
            openGuard: true,
          },
        },
        variant: { select: { type: true } },
      },
    });

    const lpaReveal = await tx.auditLog.findFirst({
      where: {
        targetType: 'ORDER',
        targetId: orderId,
        action: ADMIN_AUDIT_ACTIONS.ESIM_LPA_REVEALED,
      },
      select: { id: true },
    });

    return { items, hasLpaRevealAudit: Boolean(lpaReveal) };
  }

  findActor(adminId: string) {
    return this.prisma.user.findFirst({
      where: { id: adminId, deletedAt: null },
      select: { id: true, role: true },
    });
  }

  hasOpenAttempt(
    attempts: Array<{ status: RefundAttemptStatus }>,
  ): boolean {
    return attempts.some(
      (attempt) =>
        attempt.status === RefundAttemptStatus.SENT ||
        attempt.status === RefundAttemptStatus.UNCONFIRMED,
    );
  }

  hasSucceededAttempt(
    attempts: Array<{ status: RefundAttemptStatus }>,
  ): boolean {
    return attempts.some((attempt) => attempt.status === RefundAttemptStatus.SUCCEEDED);
  }

  findAttemptById(id: string, tx: Prisma.TransactionClient) {
    return tx.refundAttempt.findUnique({
      where: { id },
      include: { request: { include: { attempts: true, payment: true } } },
    });
  }

  findAttemptByIdempotencyKey(idempotencyKey: string, tx: Prisma.TransactionClient) {
    return tx.refundAttempt.findUnique({
      where: { idempotencyKey },
      include: { request: { include: { attempts: true, payment: true } } },
    });
  }

  findAttemptByBankReference(
    bankTransactionReference: string,
    tx: Prisma.TransactionClient,
    excludeAttemptId?: string,
  ) {
    return tx.refundAttempt.findFirst({
      where: {
        bankTransactionReference,
        ...(excludeAttemptId ? { id: { not: excludeAttemptId } } : {}),
      },
    });
  }

  createAttempt(
    data: {
      requestId: string;
      amount: Prisma.Decimal;
      currency: RefundCurrency;
      method: RefundIntendedMethod;
      idempotencyKey: string;
      openGuard: string;
      executedById: string;
      safeRequestMeta: Prisma.InputJsonValue;
    },
    tx: Prisma.TransactionClient,
  ) {
    return tx.refundAttempt.create({
      data: {
        requestId: data.requestId,
        amount: data.amount,
        currency: data.currency,
        status: RefundAttemptStatus.SENT,
        reconStatus: RefundReconStatus.PENDING_VERIFY,
        method: data.method,
        idempotencyKey: data.idempotencyKey,
        openGuard: data.openGuard,
        executedById: data.executedById,
        safeRequestMeta: data.safeRequestMeta,
      },
    });
  }

  updateAttempt(
    id: string,
    data: Prisma.RefundAttemptUpdateInput,
    tx: Prisma.TransactionClient,
  ) {
    return tx.refundAttempt.update({
      where: { id },
      data,
    });
  }

  private readonly adminReadAttemptInclude = {
    executedBy: { select: { id: true, email: true } },
    verifiedBy: { select: { id: true, email: true } },
  } as const;

  private readonly adminListInclude = {
    requestedBy: { select: { id: true, email: true } },
    approvedBy: { select: { id: true, email: true } },
    order: { select: { orderCode: true } },
    attempts: {
      include: {
        executedBy: { select: { id: true, email: true } },
        verifiedBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'asc' as const },
    },
  };

  listRequestsForAdmin(where: Prisma.RefundRequestWhereInput, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.refundRequest.count({ where }),
      this.prisma.refundRequest.findMany({
        where,
        include: this.adminListInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);
  }

  findRequestDetailForAdmin(id: string) {
    return this.prisma.refundRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { id: true, email: true } },
        approvedBy: { select: { id: true, email: true } },
        cancelledBy: { select: { id: true, email: true } },
        order: {
          select: {
            id: true,
            orderCode: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            totalAmount: true,
          },
        },
        payment: {
          select: {
            id: true,
            amount: true,
            status: true,
            gateway: true,
            paymentReference: true,
            paidAt: true,
            createdAt: true,
          },
        },
        attempts: {
          include: this.adminReadAttemptInclude,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  listRefundAuditEvents(orderId: string, requestId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        targetType: 'ORDER',
        targetId: orderId,
        action: {
          in: [
            ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
            ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_APPROVED,
            ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_CANCELLED,
            ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_SENT,
            ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_SUCCEEDED,
            ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_FAILED,
            ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_UNCONFIRMED,
            ADMIN_AUDIT_ACTIONS.REFUND_ESIM_REVIEW_CLEARED,
            ADMIN_AUDIT_ACTIONS.REFUND_RECON_VERIFIED,
            ADMIN_AUDIT_ACTIONS.REFUND_RECON_REJECTED,
            ADMIN_AUDIT_ACTIONS.REFUND_ORDER_MARKED_REFUNDED,
          ],
        },
        metadata: {
          path: ['requestId'],
          equals: requestId,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        action: true,
        createdAt: true,
        adminId: true,
        metadata: true,
      },
    });
  }

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }
}
