import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditTargetType,
  OrderPaymentStatus,
  PaymentGatewayCode,
  PaymentRecordStatus,
  Prisma,
  ProductVariantType,
  RefundAttemptStatus,
  RefundCurrency,
  RefundEsimGate,
  RefundIntendedMethod,
  RefundReconStatus,
  RefundRequestStatus,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { assertPaymentTransition } from '../../order/entities/order-state.machine';
import { RbacService } from '../../rbac/rbac.service';
import { ADMIN_AUDIT_ACTIONS } from '../entities/admin.constants';
import { buildRefundAuditMetadata } from '../entities/refund-audit';
import {
  defaultRefundIntendedMethod,
  inferRefundCurrency,
} from '../entities/refund-currency';
import { resolveRefundEsimGate } from '../entities/refund-esim-gate';
import {
  assertStatementEvidenceRef,
  evaluateOrderRefundCover,
} from '../entities/refund-order-cover';
import {
  buildClearedEsimReviewEvidence,
  canExecuteEsimGate,
  isEsimReviewCleared,
} from '../entities/refund-esim-review';
import {
  assertMaskedDestinationHint,
  buildExecuteFingerprint,
  executeFingerprintsMatch,
  hasSuccessfulTransferEvidence,
  isExecutableRefundMethod,
  isRecoverableCompleteStatus,
  normalizeIdempotencyKey,
  readExecuteFingerprint,
} from '../entities/refund-payout.rules';
import { REFUND_PERMISSIONS, REFUND_READ_PERMISSIONS } from '../entities/refund-permissions';
import {
  remainingOnRequest,
  remainingRefundable,
} from '../entities/refund-reservation';
import {
  buildRefundListWhere,
  mapRefundDetail,
  mapRefundListItem,
} from '../entities/refund-admin-read';
import { resolveAdminPagination } from '../utils/admin-pagination.util';
import {
  vietnamDayBounds,
  vietnamDayEndInclusive,
} from '../../../common/utils/vietnam-time.util';
import { RefundRequestRepository } from '../repositories/refund-request.repository';
import { AdminAuditService } from './admin-audit.service';
import type { AdminRefundRequestQueryDto } from '../dto/refund-request.dto';

export type RefundActor = { id: string; role: UserRole };

export type CreateRefundRequestInput = {
  paymentId?: string;
  amount?: string;
  currency?: RefundCurrency;
  reason?: string;
  intendedMethod?: RefundIntendedMethod;
};

@Injectable()
export class RefundRequestService {
  constructor(
    private readonly repository: RefundRequestRepository,
    private readonly rbac: RbacService,
    private readonly adminAudit: AdminAuditService,
  ) {}

  async list(adminId: string, query: AdminRefundRequestQueryDto) {
    const actor = await this.requireActor(adminId);
    await this.requireAnyRefundPermission(actor.role);

    const { skip, take } = resolveAdminPagination(query.skip, query.take);
    const where = buildRefundListWhere(query, {
      from: query.dateFrom ? vietnamDayBounds(query.dateFrom).start : undefined,
      toInclusive: query.dateTo ? vietnamDayEndInclusive(query.dateTo) : undefined,
    });
    const [total, rows] = await this.repository.listRequestsForAdmin(where, skip, take);
    return {
      items: rows.map(mapRefundListItem),
      total,
      skip,
      take,
    };
  }

  async getById(adminId: string, requestId: string) {
    const actor = await this.requireActor(adminId);
    await this.requireAnyRefundPermission(actor.role);

    const row = await this.repository.findRequestDetailForAdmin(requestId);
    if (!row) {
      throw new NotFoundException('Refund request not found');
    }

    const siblings = await this.repository.listRequestsForPaymentRead(row.paymentId);
    const auditEvents = await this.repository.listRefundAuditEvents(
      row.orderId,
      row.id,
    );

    return mapRefundDetail({
      request: row,
      order: row.order,
      payment: row.payment,
      siblings,
      auditEvents,
    });
  }

  async createForOrder(
    adminId: string,
    orderId: string,
    input: CreateRefundRequestInput,
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.REQUEST);

    const created = await this.repository.runTransaction(async (tx) => {
      const order = await this.repository.findOrderHeader(orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const payment = await this.resolvePayment(orderId, input.paymentId, tx);
      const locked = await this.repository.lockPaymentForUpdate(payment.id, tx);
      if (!locked.length) {
        throw new NotFoundException('Payment not found');
      }

      const lockedPayment = await this.repository.findPaymentById(payment.id, tx);
      if (!lockedPayment) {
        throw new NotFoundException('Payment not found');
      }
      this.assertPaymentEligible(orderId, lockedPayment);

      const existing = await this.repository.listRequestsForPayment(
        lockedPayment.id,
        tx,
      );
      const usage = remainingRefundable(lockedPayment.amount, existing);
      const amount = this.parseAmount(input.amount, usage.remaining);
      if (amount.lte(0)) {
        throw new BadRequestException('Refund amount must be greater than 0');
      }
      if (amount.gt(usage.remaining)) {
        throw new BadRequestException('Refund amount exceeds remaining refundable balance');
      }

      const currency = inferRefundCurrency(lockedPayment.gateway);
      if (input.currency && input.currency !== currency) {
        throw new BadRequestException('Refund currency does not match payment currency');
      }

      const intendedMethod =
        input.intendedMethod ?? defaultRefundIntendedMethod(lockedPayment.gateway);
      const esimGate = await this.resolveGate(orderId, tx);
      const reason = this.normalizeReason(input.reason);

      return this.repository.createRequest(
        {
          orderId,
          paymentId: lockedPayment.id,
          amount,
          currency,
          reason,
          intendedMethod,
          esimGate,
          requestedById: actor.id,
        },
        tx,
      );
    });

    await this.adminAudit.record(
      actor.id,
      ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_CREATED,
      AuditTargetType.ORDER,
      created.orderId,
      buildRefundAuditMetadata({
        requestId: created.id,
        orderId: created.orderId,
        paymentId: created.paymentId,
        amount: created.amount.toFixed(2),
        currency: created.currency,
        status: created.status,
        intendedMethod: created.intendedMethod,
        esimGate: created.esimGate,
        requiresManualReview: created.esimGate !== RefundEsimGate.NONE,
        reasonLength: created.reason.length,
      }),
    );

    return this.mapRequest(created);
  }

  async approve(adminId: string, requestId: string) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.APPROVE);

    const updated = await this.repository.runTransaction(async (tx) => {
      const request = await this.repository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }
      if (request.status !== RefundRequestStatus.REQUESTED) {
        throw new BadRequestException(
          `Refund request status ${request.status} cannot be approved`,
        );
      }

      const locked = await this.repository.lockPaymentForUpdate(request.paymentId, tx);
      if (!locked.length) {
        throw new NotFoundException('Payment not found');
      }

      if (request.requestedById === actor.id && actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('Cannot approve your own refund request');
      }

      return this.repository.updateRequest(
        requestId,
        {
          status: RefundRequestStatus.APPROVED,
          approvedBy: { connect: { id: actor.id } },
          approvedAt: new Date(),
        },
        tx,
      );
    });

    await this.adminAudit.record(
      actor.id,
      ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_APPROVED,
      AuditTargetType.ORDER,
      updated.orderId,
      buildRefundAuditMetadata({
        requestId: updated.id,
        orderId: updated.orderId,
        paymentId: updated.paymentId,
        amount: updated.amount.toFixed(2),
        currency: updated.currency,
        status: updated.status,
        intendedMethod: updated.intendedMethod,
        esimGate: updated.esimGate,
        requiresManualReview: updated.esimGate !== RefundEsimGate.NONE,
        reasonLength: updated.reason.length,
      }),
    );

    return this.mapRequest(updated);
  }

  async cancel(adminId: string, requestId: string) {
    const actor = await this.requireActor(adminId);

    const updated = await this.repository.runTransaction(async (tx) => {
      const request = await this.repository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }

      const locked = await this.repository.lockPaymentForUpdate(request.paymentId, tx);
      if (!locked.length) {
        throw new NotFoundException('Payment not found');
      }

      if (this.repository.hasOpenAttempt(request.attempts)) {
        throw new BadRequestException(
          'Cannot cancel a refund request with an open SENT or UNCONFIRMED attempt',
        );
      }
      if (this.repository.hasSucceededAttempt(request.attempts)) {
        throw new BadRequestException(
          'Cannot cancel a refund request with a SUCCEEDED attempt',
        );
      }

      if (request.status === RefundRequestStatus.REQUESTED) {
        await this.requirePermission(actor.role, REFUND_PERMISSIONS.REQUEST);
      } else if (request.status === RefundRequestStatus.APPROVED) {
        await this.requirePermission(actor.role, REFUND_PERMISSIONS.APPROVE);
      } else {
        throw new BadRequestException(
          `Refund request status ${request.status} cannot be cancelled`,
        );
      }

      return this.repository.updateRequest(
        requestId,
        {
          status: RefundRequestStatus.CANCELLED,
          cancelledBy: { connect: { id: actor.id } },
          cancelledAt: new Date(),
        },
        tx,
      );
    });

    await this.adminAudit.record(
      actor.id,
      ADMIN_AUDIT_ACTIONS.REFUND_REQUEST_CANCELLED,
      AuditTargetType.ORDER,
      updated.orderId,
      buildRefundAuditMetadata({
        requestId: updated.id,
        orderId: updated.orderId,
        paymentId: updated.paymentId,
        amount: updated.amount.toFixed(2),
        currency: updated.currency,
        status: updated.status,
        intendedMethod: updated.intendedMethod,
        esimGate: updated.esimGate,
        requiresManualReview: updated.esimGate !== RefundEsimGate.NONE,
        reasonLength: updated.reason.length,
      }),
    );

    return this.mapRequest(updated);
  }

  async clearEsimReview(adminId: string, requestId: string) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.APPROVE);

    const updated = await this.repository.runTransaction(async (tx) => {
      const locked = await this.repository.lockRequestForUpdate(requestId, tx);
      if (!locked.length) {
        throw new NotFoundException('Refund request not found');
      }
      const request = await this.repository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }
      if (request.esimGate === RefundEsimGate.NONE) {
        throw new BadRequestException('Refund request has no eSIM review to clear');
      }
      if (
        request.status === RefundRequestStatus.CANCELLED ||
        request.status === RefundRequestStatus.SUCCEEDED
      ) {
        throw new BadRequestException(
          `Refund request status ${request.status} cannot clear eSIM review`,
        );
      }
      if (isEsimReviewCleared(request.evidence)) {
        return { request, newlyCleared: false };
      }

      const next = await this.repository.updateRequest(
        requestId,
        {
          evidence: buildClearedEsimReviewEvidence(
            request.evidence,
            actor.id,
            new Date(),
          ) as Prisma.InputJsonValue,
        },
        tx,
      );
      return { request: next, newlyCleared: true };
    });

    if (updated.newlyCleared) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ESIM_REVIEW_CLEARED,
        AuditTargetType.ORDER,
        updated.request.orderId,
        buildRefundAuditMetadata({
          requestId: updated.request.id,
          orderId: updated.request.orderId,
          paymentId: updated.request.paymentId,
          amount: updated.request.amount.toFixed(2),
          currency: updated.request.currency,
          status: updated.request.status,
          intendedMethod: updated.request.intendedMethod,
          esimGate: updated.request.esimGate,
          requiresManualReview: updated.request.esimGate !== RefundEsimGate.NONE,
          esimReviewCleared: true,
        }),
      );
    }

    return this.mapRequest(updated.request, { esimReviewCleared: true });
  }

  async execute(
    adminId: string,
    requestId: string,
    input: { amount?: string; idempotencyKey?: string },
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.EXECUTE);

    let idempotencyKey: string;
    try {
      idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error && error.message === 'IDEMPOTENCY_TOO_LONG'
          ? 'Idempotency-Key must be at most 128 characters'
          : 'Idempotency-Key header is required',
      );
    }

    const executed = await this.repository.runTransaction(async (tx) => {
      const existing = await this.repository.findAttemptByIdempotencyKey(
        idempotencyKey,
        tx,
      );
      if (existing) {
        return this.resolveIdempotentExecute(existing, requestId, input.amount);
      }

      const lockedRequest = await this.repository.lockRequestForUpdate(requestId, tx);
      if (!lockedRequest.length) {
        throw new NotFoundException('Refund request not found');
      }
      const request = await this.repository.findRequestById(requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }

      const lockedPayment = await this.repository.lockPaymentForUpdate(
        request.paymentId,
        tx,
      );
      if (!lockedPayment.length) {
        throw new NotFoundException('Payment not found');
      }
      const payment = await this.repository.findPaymentById(request.paymentId, tx);
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }

      this.assertExecutableRequest(request);
      if (!canExecuteEsimGate(request.esimGate, request.evidence)) {
        throw new BadRequestException(
          'eSIM review must be cleared before executing this refund',
        );
      }
      if (this.repository.hasOpenAttempt(request.attempts)) {
        throw new BadRequestException(
          'Cannot create a refund attempt while a SENT or UNCONFIRMED attempt is open',
        );
      }

      const remaining = remainingOnRequest(request);
      if (remaining.lte(0)) {
        throw new BadRequestException('Refund request is already fully succeeded');
      }
      const amount = this.parseAmount(input.amount, remaining);
      if (!amount.eq(remaining)) {
        throw new BadRequestException('Refund attempt amount must equal the remaining request amount');
      }

      const siblings = await this.repository.listRequestsForPayment(payment.id, tx);
      const usage = remainingRefundable(payment.amount, siblings);
      if (usage.committed.gt(payment.amount)) {
        throw new BadRequestException('Refund amount exceeds remaining refundable balance');
      }

      const fingerprint = buildExecuteFingerprint({
        requestId: request.id,
        amount,
        currency: request.currency,
        method: request.intendedMethod,
      });

      let attempt;
      try {
        attempt = await this.repository.createAttempt(
          {
            requestId: request.id,
            amount,
            currency: request.currency,
            method: request.intendedMethod,
            idempotencyKey,
            openGuard: request.id,
            executedById: actor.id,
            safeRequestMeta: fingerprint,
          },
          tx,
        );
      } catch (error) {
        if (this.isUniqueViolation(error, ['idempotency_key', 'idempotencyKey'])) {
          const replay = await this.repository.findAttemptByIdempotencyKey(
            idempotencyKey,
            tx,
          );
          if (!replay) {
            throw new ConflictException('Refund execute idempotency conflict');
          }
          return this.resolveIdempotentExecute(replay, requestId, input.amount);
        }
        if (this.isUniqueViolation(error, ['open_guard', 'openGuard'])) {
          throw new BadRequestException(
            'Cannot create a refund attempt while a SENT or UNCONFIRMED attempt is open',
          );
        }
        throw error;
      }

      const updatedRequest = await this.repository.updateRequest(
        request.id,
        { status: RefundRequestStatus.PROCESSING },
        tx,
      );

      return { request: updatedRequest, attempt, replayed: false };
    });

    if (!executed.replayed) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_SENT,
        AuditTargetType.ORDER,
        executed.request.orderId,
        buildRefundAuditMetadata({
          requestId: executed.request.id,
          orderId: executed.request.orderId,
          paymentId: executed.request.paymentId,
          amount: executed.attempt.amount.toFixed(2),
          currency: executed.attempt.currency,
          status: executed.request.status,
          intendedMethod: executed.request.intendedMethod,
          esimGate: executed.request.esimGate,
          requiresManualReview: executed.request.esimGate !== RefundEsimGate.NONE,
          attemptId: executed.attempt.id,
          attemptStatus: executed.attempt.status,
          reconStatus: executed.attempt.reconStatus,
          replayed: false,
        }),
      );
    }

    return this.mapRequest(executed.request, {
      attempt: executed.attempt,
      replayed: executed.replayed,
    });
  }

  async complete(
    adminId: string,
    attemptId: string,
    input: {
      bankTransactionReference: string;
      amount: string;
      currency: RefundCurrency;
      transferredAt: string;
      destinationHint: string;
    },
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.EXECUTE);

    let destinationHint: string;
    try {
      destinationHint = assertMaskedDestinationHint(input.destinationHint);
    } catch (error) {
      throw new BadRequestException(this.destinationHintMessage(error));
    }

    const transferredAt = this.parseTransferredAt(input.transferredAt);
    const bankTransactionReference = input.bankTransactionReference.trim();
    if (!bankTransactionReference) {
      throw new BadRequestException('bankTransactionReference is required');
    }

    const completed = await this.repository.runTransaction(async (tx) => {
      const lockedAttempt = await this.repository.lockAttemptForUpdate(attemptId, tx);
      if (!lockedAttempt.length) {
        throw new NotFoundException('Refund attempt not found');
      }
      const loaded = await this.repository.findAttemptById(attemptId, tx);
      if (!loaded) {
        throw new NotFoundException('Refund attempt not found');
      }

      await this.repository.lockRequestForUpdate(loaded.requestId, tx);
      await this.repository.lockPaymentForUpdate(loaded.request.paymentId, tx);

      const request = await this.repository.findRequestById(loaded.requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }
      const attempt = request.attempts.find((row) => row.id === attemptId) ?? loaded;

      if (
        attempt.status === RefundAttemptStatus.SUCCEEDED &&
        attempt.bankTransactionReference === bankTransactionReference &&
        attempt.amount.eq(this.parseAmount(input.amount, attempt.amount)) &&
        attempt.currency === input.currency
      ) {
        return { request, attempt, replayed: true };
      }

      if (!isRecoverableCompleteStatus(attempt.status)) {
        throw new BadRequestException(
          `Refund attempt status ${attempt.status} cannot be completed`,
        );
      }

      const amount = this.parseAmount(input.amount, attempt.amount);
      if (!amount.eq(attempt.amount)) {
        throw new BadRequestException('Complete amount must match the attempt amount');
      }
      if (input.currency !== request.currency) {
        throw new BadRequestException('Complete currency must match the refund request currency');
      }

      // Serialize completes that share a bank reference across attempts (no unique index race).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`refund-bank:${bankTransactionReference}`}))`;

      const duplicate = await this.repository.findAttemptByBankReference(
        bankTransactionReference,
        tx,
        attempt.id,
      );
      if (duplicate) {
        throw new ConflictException('bankTransactionReference already belongs to another attempt');
      }

      let updatedAttempt;
      try {
        updatedAttempt = await this.repository.updateAttempt(
          attempt.id,
          {
            status: RefundAttemptStatus.SUCCEEDED,
            reconStatus: RefundReconStatus.PENDING_VERIFY,
            bankTransactionReference,
            destinationHint,
            transferredAt,
            completedAt: new Date(),
            openGuard: null,
            safeResponseMeta: {
              kind: 'complete',
              bankReferenceLength: bankTransactionReference.length,
              destinationHintLength: destinationHint.length,
            },
          },
          tx,
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('bankTransactionReference already belongs to another attempt');
        }
        throw error;
      }

      const refreshed = await this.repository.findRequestById(request.id, tx);
      if (!refreshed) {
        throw new NotFoundException('Refund request not found');
      }
      const succeededTotal = refreshed.attempts
        .filter((row) => row.status === RefundAttemptStatus.SUCCEEDED)
        .reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
      const stillOpen = this.repository.hasOpenAttempt(refreshed.attempts);
      let nextRequest = refreshed;
      if (succeededTotal.gte(refreshed.amount) && !stillOpen) {
        const updated = await this.repository.updateRequest(
          refreshed.id,
          {
            status: RefundRequestStatus.SUCCEEDED,
            completedAt: new Date(),
          },
          tx,
        );
        nextRequest = {
          ...refreshed,
          status: updated.status,
          completedAt: updated.completedAt,
        };
      }

      return { request: nextRequest, attempt: updatedAttempt, replayed: false };
    });

    if (!completed.replayed) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_SUCCEEDED,
        AuditTargetType.ORDER,
        completed.request.orderId,
        buildRefundAuditMetadata({
          requestId: completed.request.id,
          orderId: completed.request.orderId,
          paymentId: completed.request.paymentId,
          amount: completed.attempt.amount.toFixed(2),
          currency: completed.attempt.currency,
          status: completed.request.status,
          intendedMethod: completed.request.intendedMethod,
          esimGate: completed.request.esimGate,
          requiresManualReview: completed.request.esimGate !== RefundEsimGate.NONE,
          attemptId: completed.attempt.id,
          attemptStatus: completed.attempt.status,
          reconStatus: completed.attempt.reconStatus,
          bankTransactionReference,
          transferredAt: transferredAt.toISOString(),
          destinationHintPresent: true,
          replayed: false,
        }),
      );
    }

    return this.mapRequest(completed.request, {
      attempt: completed.attempt,
      replayed: completed.replayed,
    });
  }

  async fail(
    adminId: string,
    attemptId: string,
    input: { errorCode: string; errorMessage?: string },
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.EXECUTE);

    const failed = await this.repository.runTransaction(async (tx) => {
      const lockedAttempt = await this.repository.lockAttemptForUpdate(attemptId, tx);
      if (!lockedAttempt.length) {
        throw new NotFoundException('Refund attempt not found');
      }
      const loaded = await this.repository.findAttemptById(attemptId, tx);
      if (!loaded) {
        throw new NotFoundException('Refund attempt not found');
      }
      await this.repository.lockRequestForUpdate(loaded.requestId, tx);
      await this.repository.lockPaymentForUpdate(loaded.request.paymentId, tx);

      const request = await this.repository.findRequestById(loaded.requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }
      const attempt = request.attempts.find((row) => row.id === attemptId) ?? loaded;

      if (
        attempt.status === RefundAttemptStatus.FAILED &&
        attempt.errorCode === input.errorCode
      ) {
        return { request, attempt, replayed: true };
      }
      if (hasSuccessfulTransferEvidence(attempt)) {
        throw new BadRequestException(
          'Cannot fail a refund attempt that already has successful transfer evidence',
        );
      }
      if (!isRecoverableCompleteStatus(attempt.status)) {
        throw new BadRequestException(
          `Refund attempt status ${attempt.status} cannot be marked failed`,
        );
      }

      const updatedAttempt = await this.repository.updateAttempt(
        attempt.id,
        {
          status: RefundAttemptStatus.FAILED,
          openGuard: null,
          completedAt: new Date(),
          errorCode: input.errorCode,
          errorMessage: input.errorMessage?.trim().slice(0, 128) || null,
        },
        tx,
      );

      return { request, attempt: updatedAttempt, replayed: false };
    });

    if (!failed.replayed) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_FAILED,
        AuditTargetType.ORDER,
        failed.request.orderId,
        buildRefundAuditMetadata({
          requestId: failed.request.id,
          orderId: failed.request.orderId,
          paymentId: failed.request.paymentId,
          amount: failed.attempt.amount.toFixed(2),
          currency: failed.attempt.currency,
          status: failed.request.status,
          intendedMethod: failed.request.intendedMethod,
          esimGate: failed.request.esimGate,
          requiresManualReview: failed.request.esimGate !== RefundEsimGate.NONE,
          attemptId: failed.attempt.id,
          attemptStatus: failed.attempt.status,
          errorCode: input.errorCode,
        }),
      );
    }

    return this.mapRequest(failed.request, { attempt: failed.attempt });
  }

  async markUnconfirmed(
    adminId: string,
    attemptId: string,
    input: { errorCode?: string },
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.EXECUTE);
    const errorCode = input.errorCode ?? 'OPERATOR_MARKED_UNCONFIRMED';

    const updated = await this.repository.runTransaction(async (tx) => {
      const lockedAttempt = await this.repository.lockAttemptForUpdate(attemptId, tx);
      if (!lockedAttempt.length) {
        throw new NotFoundException('Refund attempt not found');
      }
      const loaded = await this.repository.findAttemptById(attemptId, tx);
      if (!loaded) {
        throw new NotFoundException('Refund attempt not found');
      }
      await this.repository.lockRequestForUpdate(loaded.requestId, tx);
      await this.repository.lockPaymentForUpdate(loaded.request.paymentId, tx);

      const request = await this.repository.findRequestById(loaded.requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }
      const attempt = request.attempts.find((row) => row.id === attemptId) ?? loaded;

      if (attempt.status === RefundAttemptStatus.UNCONFIRMED) {
        return { request, attempt, replayed: true };
      }
      if (hasSuccessfulTransferEvidence(attempt)) {
        throw new BadRequestException(
          'Cannot mark a refund attempt unconfirmed after successful transfer evidence',
        );
      }
      if (attempt.status !== RefundAttemptStatus.SENT) {
        throw new BadRequestException(
          `Refund attempt status ${attempt.status} cannot be marked unconfirmed`,
        );
      }

      const updatedAttempt = await this.repository.updateAttempt(
        attempt.id,
        {
          status: RefundAttemptStatus.UNCONFIRMED,
          errorCode,
          openGuard: request.id,
        },
        tx,
      );

      return { request, attempt: updatedAttempt, replayed: false };
    });

    if (!updated.replayed) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ATTEMPT_UNCONFIRMED,
        AuditTargetType.ORDER,
        updated.request.orderId,
        buildRefundAuditMetadata({
          requestId: updated.request.id,
          orderId: updated.request.orderId,
          paymentId: updated.request.paymentId,
          amount: updated.attempt.amount.toFixed(2),
          currency: updated.attempt.currency,
          status: updated.request.status,
          intendedMethod: updated.request.intendedMethod,
          esimGate: updated.request.esimGate,
          requiresManualReview: updated.request.esimGate !== RefundEsimGate.NONE,
          attemptId: updated.attempt.id,
          attemptStatus: updated.attempt.status,
          errorCode,
        }),
      );
    }

    return this.mapRequest(updated.request, { attempt: updated.attempt });
  }

  async reconcile(
    adminId: string,
    attemptId: string,
    input: { decision: 'VERIFIED' | 'REJECTED'; statementEvidenceRef: string },
  ) {
    const actor = await this.requireActor(adminId);
    await this.requirePermission(actor.role, REFUND_PERMISSIONS.RECONCILE);

    let statementEvidenceRef: string;
    try {
      statementEvidenceRef = assertStatementEvidenceRef(input.statementEvidenceRef);
    } catch (error) {
      throw new BadRequestException(this.statementEvidenceMessage(error));
    }

    const reconciled = await this.repository.runTransaction(async (tx) => {
      const loaded = await this.repository.findAttemptById(attemptId, tx);
      if (!loaded) {
        throw new NotFoundException('Refund attempt not found');
      }

      const orderLock = await this.repository.lockOrderForUpdate(loaded.request.orderId, tx);
      if (!orderLock.length) {
        throw new NotFoundException('Order not found');
      }
      const payments = await this.repository.listSuccessPaymentsForOrder(
        loaded.request.orderId,
        tx,
      );
      for (const payment of payments) {
        const locked = await this.repository.lockPaymentForUpdate(payment.id, tx);
        if (!locked.length) {
          throw new NotFoundException('Payment not found');
        }
      }
      await this.repository.lockRequestForUpdate(loaded.requestId, tx);
      await this.repository.lockAttemptForUpdate(attemptId, tx);

      const attempt = await this.repository.findAttemptById(attemptId, tx);
      if (!attempt) {
        throw new NotFoundException('Refund attempt not found');
      }
      const request = await this.repository.findRequestById(attempt.requestId, tx);
      if (!request) {
        throw new NotFoundException('Refund request not found');
      }

      if (attempt.status !== RefundAttemptStatus.SUCCEEDED) {
        throw new BadRequestException('Only SUCCEEDED refund attempts can be reconciled');
      }
      if (
        attempt.reconStatus === RefundReconStatus.VERIFIED ||
        attempt.reconStatus === RefundReconStatus.REJECTED
      ) {
        throw new ConflictException(
          `Refund attempt reconStatus ${attempt.reconStatus} cannot be changed`,
        );
      }
      if (!attempt.executedById || attempt.executedById === actor.id) {
        throw new ForbiddenException('Cannot reconcile a refund attempt you executed');
      }

      const verifiedAt = new Date();
      const updatedAttempt = await this.repository.updateAttempt(
        attempt.id,
        {
          reconStatus:
            input.decision === RefundReconStatus.VERIFIED
              ? RefundReconStatus.VERIFIED
              : RefundReconStatus.REJECTED,
          verifiedBy: { connect: { id: actor.id } },
          verifiedAt,
          statementEvidenceRef,
        },
        tx,
      );

      let nextRequest = request;
      if (input.decision === RefundReconStatus.REJECTED) {
        const updatedRequest = await this.repository.updateRequest(
          request.id,
          { status: RefundRequestStatus.MANUAL_REVIEW },
          tx,
        );
        nextRequest = {
          ...request,
          status: updatedRequest.status,
        };
      }

      const order = await this.repository.findOrderHeader(request.orderId, tx);
      if (!order) {
        throw new NotFoundException('Order not found');
      }

      const latestPayments = await this.repository.listSuccessPaymentsForOrder(
        request.orderId,
        tx,
      );
      const latestRequests = await this.repository.listRequestsForOrder(request.orderId, tx);
      const cover = evaluateOrderRefundCover({
        payments: latestPayments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
        })),
        requests: latestRequests.map((row) => ({
          paymentId: row.paymentId,
          amount: row.amount,
          status: row.status,
          currency: row.currency,
          attempts: row.attempts.map((item) => ({
            amount: item.amount,
            status: item.status,
            reconStatus: item.reconStatus,
            currency: item.currency,
          })),
        })),
      });

      let orderPaymentStatus = order.paymentStatus;
      let orderMarkedRefunded = false;
      if (
        cover.canMarkRefunded &&
        order.paymentStatus === OrderPaymentStatus.PAID
      ) {
        assertPaymentTransition(order.paymentStatus, OrderPaymentStatus.REFUNDED);
        const updatedOrder = await this.repository.updateOrderPaymentStatus(
          order.id,
          OrderPaymentStatus.REFUNDED,
          tx,
        );
        orderPaymentStatus = updatedOrder.paymentStatus;
        orderMarkedRefunded = true;
      }

      return {
        request: nextRequest,
        attempt: updatedAttempt,
        orderPaymentStatus,
        orderMarkedRefunded,
        fulfillmentStatus: order.fulfillmentStatus,
      };
    });

    const auditAction =
      input.decision === RefundReconStatus.VERIFIED
        ? ADMIN_AUDIT_ACTIONS.REFUND_RECON_VERIFIED
        : ADMIN_AUDIT_ACTIONS.REFUND_RECON_REJECTED;
    await this.adminAudit.record(
      actor.id,
      auditAction,
      AuditTargetType.ORDER,
      reconciled.request.orderId,
      buildRefundAuditMetadata({
        requestId: reconciled.request.id,
        orderId: reconciled.request.orderId,
        paymentId: reconciled.request.paymentId,
        amount: reconciled.attempt.amount.toFixed(2),
        currency: reconciled.attempt.currency,
        status: reconciled.request.status,
        intendedMethod: reconciled.request.intendedMethod,
        esimGate: reconciled.request.esimGate,
        requiresManualReview: reconciled.request.esimGate !== RefundEsimGate.NONE,
        attemptId: reconciled.attempt.id,
        attemptStatus: reconciled.attempt.status,
        reconStatus: reconciled.attempt.reconStatus,
        statementEvidenceRef,
        orderMarkedRefunded: reconciled.orderMarkedRefunded,
        orderPaymentStatus: reconciled.orderPaymentStatus,
      }),
    );

    if (reconciled.orderMarkedRefunded) {
      await this.adminAudit.record(
        actor.id,
        ADMIN_AUDIT_ACTIONS.REFUND_ORDER_MARKED_REFUNDED,
        AuditTargetType.ORDER,
        reconciled.request.orderId,
        buildRefundAuditMetadata({
          requestId: reconciled.request.id,
          orderId: reconciled.request.orderId,
          paymentId: reconciled.request.paymentId,
          amount: reconciled.attempt.amount.toFixed(2),
          currency: reconciled.attempt.currency,
          status: reconciled.request.status,
          intendedMethod: reconciled.request.intendedMethod,
          esimGate: reconciled.request.esimGate,
          requiresManualReview: reconciled.request.esimGate !== RefundEsimGate.NONE,
          attemptId: reconciled.attempt.id,
          orderMarkedRefunded: true,
          orderPaymentStatus: reconciled.orderPaymentStatus,
        }),
      );
    }

    return this.mapRequest(reconciled.request, {
      attempt: reconciled.attempt,
      orderPaymentStatus: reconciled.orderPaymentStatus,
      orderMarkedRefunded: reconciled.orderMarkedRefunded,
    });
  }

  private async resolvePayment(
    orderId: string,
    paymentId: string | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (paymentId) {
      const payment = await this.repository.findPaymentById(paymentId, tx);
      if (!payment) {
        throw new NotFoundException('Payment not found');
      }
      this.assertPaymentEligible(orderId, payment);
      return payment;
    }

    const successPayments = await this.repository.listSuccessPaymentsForOrder(
      orderId,
      tx,
    );
    if (successPayments.length === 0) {
      throw new BadRequestException('Order has no SUCCESS payment to refund');
    }
    if (successPayments.length > 1) {
      throw new BadRequestException('paymentId is required when the order has multiple SUCCESS payments');
    }
    return successPayments[0];
  }

  private assertPaymentEligible(
    orderId: string,
    payment: { orderId: string; status: PaymentRecordStatus; gateway: PaymentGatewayCode },
  ) {
    if (payment.orderId !== orderId) {
      throw new BadRequestException('Payment does not belong to this order');
    }
    if (payment.status !== PaymentRecordStatus.SUCCESS) {
      throw new BadRequestException('Only SUCCESS payments can be refunded');
    }
  }

  private parseAmount(raw: string | undefined, remaining: Decimal): Decimal {
    if (raw == null || raw.trim() === '') {
      return remaining;
    }
    let amount: Decimal;
    try {
      amount = new Decimal(raw.trim());
    } catch {
      throw new BadRequestException('Refund amount is invalid');
    }
    if (!amount.isFinite() || amount.isNaN()) {
      throw new BadRequestException('Refund amount is invalid');
    }
    if (amount.dp() > 2) {
      throw new BadRequestException('Refund amount cannot have more than 2 decimal places');
    }
    return amount;
  }

  private normalizeReason(reason: string | undefined): string {
    const trimmed = reason?.trim() ?? '';
    if (trimmed.length >= 3) {
      return trimmed.slice(0, 512);
    }
    return 'Admin requested refund';
  }

  private async resolveGate(orderId: string, tx: Prisma.TransactionClient) {
    const sources = await this.repository.loadEsimGateSources(orderId, tx);
    const esimItems = sources.items.filter(
      (item) =>
        item.variant.type === ProductVariantType.ESIM ||
        item.esimProfile != null ||
        item.esimAttempts.length > 0,
    );
    if (esimItems.length === 0) {
      return RefundEsimGate.NONE;
    }

    return resolveRefundEsimGate({
      hasProfile: esimItems.some((item) => item.esimProfile != null),
      hasLpaRevealAudit: sources.hasLpaRevealAudit,
      attempts: esimItems.flatMap((item) => item.esimAttempts),
    });
  }

  private async requireActor(adminId: string): Promise<RefundActor> {
    const actor = await this.repository.findActor(adminId);
    if (!actor) {
      throw new ForbiddenException('Admin user not found');
    }
    return actor;
  }

  private async requirePermission(role: UserRole, permission: string) {
    const allowed = await this.rbac.roleHasPermission(role, permission);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private async requireAnyRefundPermission(role: UserRole) {
    const allowed = await this.rbac.roleHasAnyPermission(
      role,
      [...REFUND_READ_PERMISSIONS],
    );
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private assertExecutableRequest(request: {
    status: RefundRequestStatus;
    intendedMethod: RefundIntendedMethod;
  }) {
    if (
      request.status !== RefundRequestStatus.APPROVED &&
      request.status !== RefundRequestStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Refund request status ${request.status} cannot be executed`,
      );
    }
    if (!isExecutableRefundMethod(request.intendedMethod)) {
      throw new BadRequestException(
        `Refund method ${request.intendedMethod} is not executable in v1`,
      );
    }
  }

  private resolveIdempotentExecute(
    existing: {
      id: string;
      requestId: string;
      amount: Decimal;
      currency: RefundCurrency;
      status: RefundAttemptStatus;
      reconStatus: RefundReconStatus;
      method: RefundIntendedMethod;
      openGuard?: string | null;
      executedById?: string | null;
      bankTransactionReference?: string | null;
      destinationHint?: string | null;
      transferredAt?: Date | null;
      errorCode?: string | null;
      safeRequestMeta: Prisma.JsonValue;
      request: {
        id: string;
        orderId: string;
        paymentId: string;
        amount: Decimal;
        currency: RefundCurrency;
        status: RefundRequestStatus;
        intendedMethod: RefundIntendedMethod;
        esimGate: RefundEsimGate;
        reason: string;
        evidence?: Prisma.JsonValue;
      };
    },
    requestId: string,
    amount?: string,
  ) {
    if (existing.requestId !== requestId) {
      throw new ConflictException(
        'Idempotency-Key already belongs to a different refund request',
      );
    }
    const stored = readExecuteFingerprint(existing.safeRequestMeta);
    const incoming = buildExecuteFingerprint({
      requestId,
      amount: amount && amount.trim() !== '' ? amount : existing.amount,
      currency: existing.currency,
      method: existing.method,
    });
    if (!stored || !executeFingerprintsMatch(stored, incoming)) {
      throw new ConflictException(
        'Idempotency-Key was reused with a different execute payload',
      );
    }
    return { request: existing.request, attempt: existing, replayed: true };
  }

  private isUniqueViolation(error: unknown, fields: string[]): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = error.meta?.target;
    const names = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    return fields.some((field) => names.includes(field));
  }

  private parseTransferredAt(raw: string): Date {
    const transferredAt = new Date(raw);
    if (Number.isNaN(transferredAt.getTime())) {
      throw new BadRequestException('transferredAt is invalid');
    }
    const maxFuture = Date.now() + 5 * 60 * 1000;
    if (transferredAt.getTime() > maxFuture) {
      throw new BadRequestException('transferredAt cannot be in the future');
    }
    return transferredAt;
  }

  private destinationHintMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    if (code === 'DESTINATION_HINT_FULL_ACCOUNT') {
      return 'destinationHint must not contain a full account number';
    }
    if (code === 'DESTINATION_HINT_NOT_MASKED') {
      return 'destinationHint must be masked';
    }
    return 'destinationHint is invalid';
  }

  private statementEvidenceMessage(error: unknown): string {
    const code = error instanceof Error ? error.message : '';
    if (code === 'STATEMENT_EVIDENCE_FULL_ACCOUNT') {
      return 'statementEvidenceRef must not contain a full account number';
    }
    if (code === 'STATEMENT_EVIDENCE_RAW') {
      return 'statementEvidenceRef cannot contain raw statement text';
    }
    return 'statementEvidenceRef is invalid';
  }

  private mapRequest(
    request: {
      id: string;
      orderId: string;
      paymentId: string;
      amount: Decimal;
      currency: RefundCurrency;
      status: RefundRequestStatus;
      intendedMethod: RefundIntendedMethod;
      esimGate: RefundEsimGate;
      reason?: string;
      evidence?: Prisma.JsonValue;
    },
    extra?: {
      attempt?: {
        id: string;
        status: RefundAttemptStatus;
        reconStatus?: RefundReconStatus | string;
        amount: Decimal;
        currency: RefundCurrency;
        method?: RefundIntendedMethod;
        openGuard?: string | null;
        executedById?: string | null;
        bankTransactionReference?: string | null;
        destinationHint?: string | null;
        transferredAt?: Date | null;
        errorCode?: string | null;
        verifiedById?: string | null;
        statementEvidenceRef?: string | null;
      };
      replayed?: boolean;
      esimReviewCleared?: boolean;
      orderPaymentStatus?: string;
      orderMarkedRefunded?: boolean;
    },
  ) {
    return {
      id: request.id,
      orderId: request.orderId,
      paymentId: request.paymentId,
      amount: request.amount.toFixed(2),
      currency: request.currency,
      status: request.status,
      intendedMethod: request.intendedMethod,
      esimGate: request.esimGate,
      requiresManualReview:
        request.esimGate !== RefundEsimGate.NONE && !isEsimReviewCleared(request.evidence),
      esimReviewCleared: extra?.esimReviewCleared ?? isEsimReviewCleared(request.evidence),
      fulfillmentUnchanged: true,
      paymentUnchanged: true,
      orderUnchanged: extra?.orderMarkedRefunded ? false : true,
      orderPaymentStatus: extra?.orderPaymentStatus,
      orderMarkedRefunded: extra?.orderMarkedRefunded ?? false,
      replayed: extra?.replayed ?? false,
      ...(extra?.attempt
        ? {
            attempt: {
              id: extra.attempt.id,
              status: extra.attempt.status,
              reconStatus: extra.attempt.reconStatus ?? RefundReconStatus.PENDING_VERIFY,
              amount: extra.attempt.amount.toFixed(2),
              currency: extra.attempt.currency,
              method: extra.attempt.method ?? request.intendedMethod,
              openGuard: extra.attempt.openGuard ?? null,
              executedById: extra.attempt.executedById ?? null,
              bankTransactionReference: extra.attempt.bankTransactionReference ?? null,
              destinationHint: extra.attempt.destinationHint ?? null,
              transferredAt: extra.attempt.transferredAt?.toISOString() ?? null,
              errorCode: extra.attempt.errorCode ?? null,
              verifiedById: extra.attempt.verifiedById ?? null,
              statementEvidenceRef: extra.attempt.statementEvidenceRef ?? null,
            },
          }
        : {}),
    };
  }
}
