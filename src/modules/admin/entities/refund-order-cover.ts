import { Decimal } from '@prisma/client/runtime/library';
import { remainingRefundable } from './refund-reservation';

const ACTIVE_REQUEST_STATUSES = new Set([
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'MANUAL_REVIEW',
]);

const OPEN_ATTEMPT_STATUSES = new Set(['SENT', 'UNCONFIRMED']);

export type RefundCoverAttempt = {
  amount: Decimal | string | number;
  status: string;
  reconStatus: string;
  currency?: string;
};

export type RefundCoverRequest = {
  paymentId: string;
  amount: Decimal | string | number;
  status: string;
  currency: string;
  attempts: RefundCoverAttempt[];
};

export type RefundCoverPayment = {
  id: string;
  amount: Decimal | string | number;
  status: string;
};

function asDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function evaluatePaymentRefundCover(
  payment: RefundCoverPayment,
  requests: RefundCoverRequest[],
): {
  fullyCovered: boolean;
  succeeded: Decimal;
  verifiedCover: Decimal;
  reserved: Decimal;
  overRefund: boolean;
  hasOpenAttempt: boolean;
  hasActiveRequest: boolean;
  hasUnverifiedSucceeded: boolean;
  mixedCurrency: boolean;
} {
  const owned = requests.filter((request) => request.paymentId === payment.id);
  const usage = remainingRefundable(payment.amount, owned);
  const paymentAmount = asDecimal(payment.amount);

  let verifiedCover = new Decimal(0);
  let hasOpenAttempt = false;
  let hasUnverifiedSucceeded = false;
  const currencies = new Set<string>();

  for (const request of owned) {
    currencies.add(request.currency);
    for (const attempt of request.attempts) {
      if (OPEN_ATTEMPT_STATUSES.has(attempt.status)) {
        hasOpenAttempt = true;
      }
      if (attempt.status === 'SUCCEEDED') {
        if (attempt.reconStatus === 'VERIFIED') {
          verifiedCover = verifiedCover.plus(asDecimal(attempt.amount));
        } else {
          hasUnverifiedSucceeded = true;
        }
      }
    }
  }

  const overRefund = usage.succeeded.gt(paymentAmount);
  const hasActiveRequest = owned.some((request) =>
    ACTIVE_REQUEST_STATUSES.has(request.status),
  );
  const mixedCurrency = currencies.size > 1;
  const fullyCovered =
    payment.status === 'SUCCESS' &&
    owned.length > 0 &&
    usage.succeeded.eq(paymentAmount) &&
    verifiedCover.eq(paymentAmount) &&
    usage.reserved.eq(0) &&
    !overRefund &&
    !hasOpenAttempt &&
    !hasActiveRequest &&
    !hasUnverifiedSucceeded &&
    !mixedCurrency;

  return {
    fullyCovered,
    succeeded: usage.succeeded,
    verifiedCover,
    reserved: usage.reserved,
    overRefund,
    hasOpenAttempt,
    hasActiveRequest,
    hasUnverifiedSucceeded,
    mixedCurrency,
  };
}

export function evaluateOrderRefundCover(input: {
  payments: RefundCoverPayment[];
  requests: RefundCoverRequest[];
}): {
  canMarkRefunded: boolean;
  reasons: string[];
} {
  const successPayments = input.payments.filter(
    (payment) => payment.status === 'SUCCESS',
  );
  const reasons: string[] = [];

  if (successPayments.length === 0) {
    return { canMarkRefunded: false, reasons: ['no_success_payment'] };
  }

  for (const payment of successPayments) {
    const cover = evaluatePaymentRefundCover(payment, input.requests);
    if (cover.overRefund) reasons.push(`over_refund:${payment.id}`);
    if (cover.hasOpenAttempt) reasons.push(`open_attempt:${payment.id}`);
    if (cover.hasActiveRequest) reasons.push(`active_request:${payment.id}`);
    if (cover.hasUnverifiedSucceeded) reasons.push(`unverified:${payment.id}`);
    if (cover.reserved.gt(0)) reasons.push(`reserved:${payment.id}`);
    if (cover.mixedCurrency) reasons.push(`mixed_currency:${payment.id}`);
    if (!cover.fullyCovered && !reasons.some((reason) => reason.endsWith(payment.id))) {
      reasons.push(`not_fully_covered:${payment.id}`);
    }
  }

  return {
    canMarkRefunded: reasons.length === 0,
    reasons,
  };
}

export function assertStatementEvidenceRef(raw: string): string {
  const value = raw.trim();
  if (value.length < 1 || value.length > 128) {
    throw new Error('STATEMENT_EVIDENCE_LENGTH');
  }
  if (/\d{9,}/.test(value)) {
    throw new Error('STATEMENT_EVIDENCE_FULL_ACCOUNT');
  }
  if (/[\r\n]/.test(value)) {
    throw new Error('STATEMENT_EVIDENCE_RAW');
  }
  return value;
}
