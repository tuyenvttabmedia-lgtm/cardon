import {
  Prisma,
  RefundAttemptStatus,
  RefundEsimGate,
  RefundReconStatus,
  RefundRequestStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { readEsimReviewEvidence } from './refund-esim-review';
import { remainingOnRequest, remainingRefundable } from './refund-reservation';
import { sanitizeRefundAuditMetadata } from './refund-audit';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ACTIONABLE_REQUEST_STATUSES: RefundRequestStatus[] = [
  RefundRequestStatus.REQUESTED,
  RefundRequestStatus.APPROVED,
  RefundRequestStatus.PROCESSING,
  RefundRequestStatus.MANUAL_REVIEW,
];

const OPEN_ATTEMPT_STATUSES: RefundAttemptStatus[] = [
  RefundAttemptStatus.SENT,
  RefundAttemptStatus.UNCONFIRMED,
];

export const REFUND_ADMIN_AUDIT_ACTIONS = [
  'REFUND_REQUEST_CREATED',
  'REFUND_REQUEST_APPROVED',
  'REFUND_REQUEST_CANCELLED',
  'REFUND_ATTEMPT_SENT',
  'REFUND_ATTEMPT_SUCCEEDED',
  'REFUND_ATTEMPT_FAILED',
  'REFUND_ATTEMPT_UNCONFIRMED',
  'REFUND_ESIM_REVIEW_CLEARED',
  'REFUND_RECON_VERIFIED',
  'REFUND_RECON_REJECTED',
  'REFUND_ORDER_MARKED_REFUNDED',
] as const;

const SENSITIVE_PAYLOAD_PATTERN =
  /(secret|password|pin|lpa|sm[-_]?dp|payload|gatewayResponse|gateway_response|authorization|token|cookie|accountNumber|account_number|safeRequestMeta|safeResponseMeta|errorMessage)/i;

export type RefundAdminListQuery = {
  dateFrom?: string;
  dateTo?: string;
  orderId?: string;
  paymentId?: string;
  requestStatus?: RefundRequestStatus;
  attemptStatus?: RefundAttemptStatus;
  esimGate?: RefundEsimGate;
  needsAction?: boolean;
  q?: string;
};

export type RefundAdminStaff = {
  id: string;
  email: string;
};

export type RefundAdminAttemptView = {
  id: string;
  status: RefundAttemptStatus;
  reconStatus: RefundReconStatus;
  amount: string;
  currency: string;
  method: string;
  isOpen: boolean;
  payoutRecorded: boolean;
  reconVerified: boolean;
  bankTransactionReference: string | null;
  destinationHint: string | null;
  transferredAt: string | null;
  executedBy: RefundAdminStaff | null;
  verifiedBy: RefundAdminStaff | null;
  verifiedAt: string | null;
  statementEvidenceRef: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefundAdminWarningCode =
  | 'CREATE_UNCLEAR'
  | 'HAS_REFERENCE'
  | 'ISSUED'
  | 'UNCONFIRMED'
  | 'MANUAL_REVIEW'
  | 'PARTIAL';

export function isExactRefundId(value: string | undefined): value is string {
  return Boolean(value && UUID_RE.test(value.trim()));
}

function asDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function money(value: Decimal | string | number): string {
  return asDecimal(value).toFixed(2);
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function staff(
  actor?: { id: string; email: string } | null,
): RefundAdminStaff | null {
  if (!actor?.id || !actor.email) {
    return null;
  }
  return { id: actor.id, email: actor.email };
}

function impossibleMatch(): Prisma.RefundRequestWhereInput {
  return { id: { in: [] } };
}

export function refundNeedsAction(input: {
  status: RefundRequestStatus | string;
  attempts: Array<{
    status: RefundAttemptStatus | string;
    reconStatus: RefundReconStatus | string;
  }>;
}): boolean {
  if (ACTIONABLE_REQUEST_STATUSES.includes(input.status as RefundRequestStatus)) {
    return true;
  }
  return input.attempts.some((attempt) => {
    if (OPEN_ATTEMPT_STATUSES.includes(attempt.status as RefundAttemptStatus)) {
      return true;
    }
    return (
      attempt.status === RefundAttemptStatus.SUCCEEDED &&
      attempt.reconStatus === RefundReconStatus.PENDING_VERIFY
    );
  });
}

export function buildRefundListWhere(
  query: RefundAdminListQuery,
  range?: { from?: Date; toInclusive?: Date },
): Prisma.RefundRequestWhereInput {
  const where: Prisma.RefundRequestWhereInput = {};
  const and: Prisma.RefundRequestWhereInput[] = [];

  if (query.q != null && query.q.trim() !== '') {
    if (!isExactRefundId(query.q)) {
      return impossibleMatch();
    }
    const id = query.q.trim();
    and.push({
      OR: [
        { id },
        { orderId: id },
        { paymentId: id },
        { attempts: { some: { id } } },
      ],
    });
  }

  if (query.orderId) {
    if (!isExactRefundId(query.orderId)) {
      return impossibleMatch();
    }
    where.orderId = query.orderId.trim();
  }
  if (query.paymentId) {
    if (!isExactRefundId(query.paymentId)) {
      return impossibleMatch();
    }
    where.paymentId = query.paymentId.trim();
  }
  if (query.requestStatus) {
    where.status = query.requestStatus;
  }
  if (query.esimGate) {
    where.esimGate = query.esimGate;
  }
  if (query.attemptStatus) {
    where.attempts = { some: { status: query.attemptStatus } };
  }
  if (query.needsAction) {
    and.push({
      OR: [
        { status: { in: ACTIONABLE_REQUEST_STATUSES } },
        { attempts: { some: { status: { in: OPEN_ATTEMPT_STATUSES } } } },
        {
          attempts: {
            some: {
              status: RefundAttemptStatus.SUCCEEDED,
              reconStatus: RefundReconStatus.PENDING_VERIFY,
            },
          },
        },
      ],
    });
  }
  if (range?.from || range?.toInclusive) {
    where.createdAt = {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.toInclusive ? { lte: range.toInclusive } : {}),
    };
  }
  if (and.length > 0) {
    where.AND = and;
  }
  return where;
}

export function mapRefundAttempt(attempt: {
  id: string;
  status: RefundAttemptStatus;
  reconStatus: RefundReconStatus;
  amount: Decimal | string | number;
  currency: string;
  method: string;
  bankTransactionReference?: string | null;
  destinationHint?: string | null;
  transferredAt?: Date | string | null;
  executedBy?: { id: string; email: string } | null;
  executedById?: string | null;
  verifiedBy?: { id: string; email: string } | null;
  verifiedAt?: Date | string | null;
  statementEvidenceRef?: string | null;
  errorCode?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}): RefundAdminAttemptView {
  return {
    id: attempt.id,
    status: attempt.status,
    reconStatus: attempt.reconStatus,
    amount: money(attempt.amount),
    currency: attempt.currency,
    method: attempt.method,
    isOpen:
      attempt.status === RefundAttemptStatus.SENT ||
      attempt.status === RefundAttemptStatus.UNCONFIRMED,
    payoutRecorded: attempt.status === RefundAttemptStatus.SUCCEEDED,
    reconVerified: attempt.reconStatus === RefundReconStatus.VERIFIED,
    bankTransactionReference: attempt.bankTransactionReference ?? null,
    destinationHint: attempt.destinationHint ?? null,
    transferredAt: iso(attempt.transferredAt),
    executedBy: staff(attempt.executedBy),
    verifiedBy: staff(attempt.verifiedBy),
    verifiedAt: iso(attempt.verifiedAt),
    statementEvidenceRef: attempt.statementEvidenceRef ?? null,
    errorCode: attempt.errorCode ?? null,
    createdAt: iso(attempt.createdAt) ?? '',
    updatedAt: iso(attempt.updatedAt) ?? '',
  };
}

export function refundAdminWarnings(input: {
  status: RefundRequestStatus | string;
  esimGate: RefundEsimGate | string;
  requestAmount: Decimal | string | number;
  paymentAmount?: Decimal | string | number;
  attempts: Array<{
    status: RefundAttemptStatus | string;
    amount: Decimal | string | number;
  }>;
}): RefundAdminWarningCode[] {
  const warnings: RefundAdminWarningCode[] = [];
  if (input.esimGate === RefundEsimGate.CREATE_UNCLEAR) {
    warnings.push('CREATE_UNCLEAR');
  }
  if (input.esimGate === RefundEsimGate.HAS_REFERENCE) {
    warnings.push('HAS_REFERENCE');
  }
  if (input.esimGate === RefundEsimGate.ISSUED) {
    warnings.push('ISSUED');
  }
  if (input.attempts.some((attempt) => attempt.status === RefundAttemptStatus.UNCONFIRMED)) {
    warnings.push('UNCONFIRMED');
  }
  if (input.status === RefundRequestStatus.MANUAL_REVIEW) {
    warnings.push('MANUAL_REVIEW');
  }
  const succeeded = input.attempts
    .filter((attempt) => attempt.status === RefundAttemptStatus.SUCCEEDED)
    .reduce((sum, attempt) => sum.plus(asDecimal(attempt.amount)), new Decimal(0));
  const remaining = remainingOnRequest({
    amount: input.requestAmount,
    status: String(input.status),
    attempts: input.attempts,
  });
  const paymentAmount = input.paymentAmount ? asDecimal(input.paymentAmount) : null;
  if (
    (succeeded.gt(0) && remaining.gt(0)) ||
    (paymentAmount != null && asDecimal(input.requestAmount).lt(paymentAmount))
  ) {
    warnings.push('PARTIAL');
  }
  return warnings;
}

export function mapRefundListItem(row: {
  id: string;
  orderId: string;
  paymentId: string;
  amount: Decimal | string | number;
  currency: string;
  status: RefundRequestStatus;
  intendedMethod: string;
  esimGate: RefundEsimGate;
  evidence?: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  requestedBy?: { id: string; email: string } | null;
  approvedBy?: { id: string; email: string } | null;
  order?: { orderCode?: string | null } | null;
  attempts: Array<{
    id: string;
    status: RefundAttemptStatus;
    reconStatus: RefundReconStatus;
    amount: Decimal | string | number;
    currency: string;
    method: string;
    executedBy?: { id: string; email: string } | null;
    createdAt: Date | string;
    updatedAt: Date | string;
    bankTransactionReference?: string | null;
    destinationHint?: string | null;
    transferredAt?: Date | string | null;
    verifiedBy?: { id: string; email: string } | null;
    verifiedAt?: Date | string | null;
    statementEvidenceRef?: string | null;
    errorCode?: string | null;
  }>;
}) {
  const attempts = [...row.attempts].sort((left, right) => {
    const a = new Date(left.createdAt).getTime();
    const b = new Date(right.createdAt).getTime();
    return a - b;
  });
  const latest = attempts.length > 0 ? mapRefundAttempt(attempts[attempts.length - 1]) : null;
  const review = readEsimReviewEvidence(row.evidence);
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.order?.orderCode ?? null,
    paymentId: row.paymentId,
    amount: money(row.amount),
    currency: row.currency,
    status: row.status,
    intendedMethod: row.intendedMethod,
    esimGate: row.esimGate,
    requiresManualReview: row.esimGate !== RefundEsimGate.NONE && !review.esimReviewCleared,
    latestAttemptStatus: latest?.status ?? null,
    latestReconStatus: latest?.reconStatus ?? null,
    payoutRecorded: latest?.payoutRecorded ?? false,
    reconVerified: latest?.reconVerified ?? false,
    needsAction: refundNeedsAction(row),
    requestedAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    requestedBy: staff(row.requestedBy),
    approvedBy: staff(row.approvedBy),
    executedBy: latest?.executedBy ?? null,
  };
}

export function mapRefundDetail(input: {
  request: {
    id: string;
    orderId: string;
    paymentId: string;
    amount: Decimal | string | number;
    currency: string;
    reason: string;
    status: RefundRequestStatus;
    intendedMethod: string;
    esimGate: RefundEsimGate;
    evidence?: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
    approvedAt?: Date | string | null;
    cancelledAt?: Date | string | null;
    completedAt?: Date | string | null;
    requestedBy?: { id: string; email: string } | null;
    approvedBy?: { id: string; email: string } | null;
    cancelledBy?: { id: string; email: string } | null;
    attempts: Array<Parameters<typeof mapRefundAttempt>[0]>;
  };
  order: {
    id: string;
    orderCode: string;
    paymentStatus: string;
    fulfillmentStatus: string;
    totalAmount: Decimal | string | number;
  };
  payment: {
    id: string;
    amount: Decimal | string | number;
    status: string;
    gateway: string;
    paymentReference: string;
    paidAt?: Date | string | null;
    createdAt: Date | string;
  };
  siblings: Array<{
    amount: Decimal | string | number;
    status: string;
    attempts: Array<{ amount: Decimal | string | number; status: string }>;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    createdAt: Date | string;
    adminId: string;
    metadata: unknown;
  }>;
}) {
  const review = readEsimReviewEvidence(input.request.evidence);
  const attempts = [...input.request.attempts]
    .sort((left, right) => {
      const a = new Date(left.createdAt).getTime();
      const b = new Date(right.createdAt).getTime();
      return a - b;
    })
    .map(mapRefundAttempt);
  const usage = remainingRefundable(input.payment.amount, input.siblings);
  const remainingRequest = remainingOnRequest({
    amount: input.request.amount,
    status: input.request.status,
    attempts: input.request.attempts,
  });

  return {
    id: input.request.id,
    orderId: input.request.orderId,
    paymentId: input.request.paymentId,
    amount: money(input.request.amount),
    currency: input.request.currency,
    reason: input.request.reason,
    status: input.request.status,
    intendedMethod: input.request.intendedMethod,
    esimGate: input.request.esimGate,
    requiresManualReview:
      input.request.esimGate !== RefundEsimGate.NONE && !review.esimReviewCleared,
    esimReview: {
      esimReviewCleared: review.esimReviewCleared === true,
      esimReviewClearedAt: review.esimReviewClearedAt ?? null,
      esimReviewClearedById: review.esimReviewClearedById ?? null,
    },
    requestedAt: iso(input.request.createdAt),
    updatedAt: iso(input.request.updatedAt),
    approvedAt: iso(input.request.approvedAt),
    cancelledAt: iso(input.request.cancelledAt),
    completedAt: iso(input.request.completedAt),
    requestedBy: staff(input.request.requestedBy),
    approvedBy: staff(input.request.approvedBy),
    cancelledBy: staff(input.request.cancelledBy),
    order: {
      id: input.order.id,
      orderCode: input.order.orderCode,
      paymentStatus: input.order.paymentStatus,
      fulfillmentStatus: input.order.fulfillmentStatus,
      totalAmount: money(input.order.totalAmount),
    },
    payment: {
      id: input.payment.id,
      amount: money(input.payment.amount),
      status: input.payment.status,
      gateway: input.payment.gateway,
      paymentReference: input.payment.paymentReference,
      paidAt: iso(input.payment.paidAt),
      createdAt: iso(input.payment.createdAt),
    },
    cover: {
      paymentAmount: usage.paymentAmount.toFixed(2),
      succeeded: usage.succeeded.toFixed(2),
      reserved: usage.reserved.toFixed(2),
      remainingRefundable: usage.remaining.toFixed(2),
      remainingOnRequest: remainingRequest.toFixed(2),
    },
    attempts,
    warnings: refundAdminWarnings({
      status: input.request.status,
      esimGate: input.request.esimGate,
      requestAmount: input.request.amount,
      paymentAmount: input.payment.amount,
      attempts: input.request.attempts,
    }),
    auditEvents: input.auditEvents
      .filter((event) =>
        (REFUND_ADMIN_AUDIT_ACTIONS as readonly string[]).includes(event.action),
      )
      .map((event) => ({
        id: event.id,
        action: event.action,
        createdAt: iso(event.createdAt),
        actorId: event.adminId,
        metadata: sanitizeRefundAuditMetadata(event.metadata),
      })),
  };
}

export function refundAdminPayloadContainsSensitiveData(payload: unknown): boolean {
  return JSON.stringify(payload).match(SENSITIVE_PAYLOAD_PATTERN) != null;
}
