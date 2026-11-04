import { Decimal } from '@prisma/client/runtime/library';

const RESERVING_REQUEST_STATUSES = new Set([
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'MANUAL_REVIEW',
]);

const OPEN_ATTEMPT_STATUSES = new Set(['SENT', 'UNCONFIRMED']);

export type RefundReservationAttempt = {
  amount: Decimal | string | number;
  status: string;
};

export type RefundReservationRequest = {
  amount: Decimal | string | number;
  status: string;
  attempts: RefundReservationAttempt[];
};

function asDecimal(value: Decimal | string | number): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

function maxDecimal(left: Decimal, right: Decimal): Decimal {
  return left.gte(right) ? left : right;
}

function nonNegative(value: Decimal): Decimal {
  return value.lt(0) ? new Decimal(0) : value;
}

/**
 * succeeded = SUM(SUCCEEDED attempts).
 * reserved = open SENT/UNCONFIRMED attempts plus remaining hold on
 * REQUESTED|APPROVED|PROCESSING|MANUAL_REVIEW requests, without double-counting.
 * UNCONFIRMED does not release reservation.
 */
export function summarizeRefundUsage(requests: RefundReservationRequest[]): {
  succeeded: Decimal;
  reserved: Decimal;
  committed: Decimal;
} {
  let succeeded = new Decimal(0);
  let reserved = new Decimal(0);

  for (const request of requests) {
    const requestAmount = asDecimal(request.amount);
    let succeededOnRequest = new Decimal(0);
    let openOnRequest = new Decimal(0);

    for (const attempt of request.attempts) {
      const amount = asDecimal(attempt.amount);
      if (attempt.status === 'SUCCEEDED') {
        succeededOnRequest = succeededOnRequest.plus(amount);
      } else if (OPEN_ATTEMPT_STATUSES.has(attempt.status)) {
        openOnRequest = openOnRequest.plus(amount);
      }
    }

    succeeded = succeeded.plus(succeededOnRequest);

    if (RESERVING_REQUEST_STATUSES.has(request.status)) {
      const remainingOnRequest = nonNegative(
        requestAmount.minus(succeededOnRequest),
      );
      reserved = reserved.plus(maxDecimal(remainingOnRequest, openOnRequest));
    } else {
      reserved = reserved.plus(openOnRequest);
    }
  }

  return {
    succeeded,
    reserved,
    committed: succeeded.plus(reserved),
  };
}

export function remainingOnRequest(request: RefundReservationRequest): Decimal {
  const requestAmount = asDecimal(request.amount);
  let succeededOnRequest = new Decimal(0);
  for (const attempt of request.attempts) {
    if (attempt.status === 'SUCCEEDED') {
      succeededOnRequest = succeededOnRequest.plus(asDecimal(attempt.amount));
    }
  }
  return nonNegative(requestAmount.minus(succeededOnRequest));
}

export function remainingRefundable(
  paymentAmount: Decimal | string | number,
  requests: RefundReservationRequest[],
): {
  succeeded: Decimal;
  reserved: Decimal;
  committed: Decimal;
  remaining: Decimal;
  paymentAmount: Decimal;
} {
  const usage = summarizeRefundUsage(requests);
  const amount = asDecimal(paymentAmount);
  return {
    ...usage,
    paymentAmount: amount,
    remaining: nonNegative(amount.minus(usage.committed)),
  };
}
