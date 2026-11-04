import {
  RefundAttemptStatus,
  RefundIntendedMethod,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export const EXECUTABLE_REFUND_METHODS: ReadonlySet<RefundIntendedMethod> = new Set([
  RefundIntendedMethod.BANK_PAYOUT,
  RefundIntendedMethod.MANUAL_OTHER,
]);

export const BLOCKED_REFUND_METHODS: ReadonlySet<RefundIntendedMethod> = new Set([
  RefundIntendedMethod.SEPAY_PG_VOID,
  RefundIntendedMethod.SEPAY_PG_REFUND,
  RefundIntendedMethod.PAYPAL_REFUND,
]);

export const SAFE_FAIL_ERROR_CODES = [
  'TRANSFER_NOT_SENT',
  'TRANSFER_CANCELLED',
  'OPERATOR_CONFIRMED_NOT_SENT',
] as const;

export const SAFE_UNCONFIRMED_ERROR_CODES = [
  'CONNECTION_LOST',
  'STATEMENT_NOT_FOUND',
  'OPERATOR_MARKED_UNCONFIRMED',
] as const;

export type SafeFailErrorCode = (typeof SAFE_FAIL_ERROR_CODES)[number];
export type SafeUnconfirmedErrorCode = (typeof SAFE_UNCONFIRMED_ERROR_CODES)[number];

const CONSECUTIVE_DIGITS = /\d{9,}/;
const MASK_MARK = /\*/;

export type ExecuteFingerprint = {
  kind: 'execute';
  requestId: string;
  amount: string;
  currency: string;
  method: string;
};

export function isExecutableRefundMethod(
  method: RefundIntendedMethod,
): boolean {
  return EXECUTABLE_REFUND_METHODS.has(method);
}

export function normalizeIdempotencyKey(raw: string | undefined): string {
  const key = raw?.trim() ?? '';
  if (!key) {
    throw new Error('IDEMPOTENCY_REQUIRED');
  }
  if (key.length > 128) {
    throw new Error('IDEMPOTENCY_TOO_LONG');
  }
  return key;
}

export function buildExecuteFingerprint(input: {
  requestId: string;
  amount: Decimal | string;
  currency: string;
  method: string;
}): ExecuteFingerprint {
  const amount =
    input.amount instanceof Decimal ? input.amount.toFixed(2) : new Decimal(input.amount).toFixed(2);
  return {
    kind: 'execute',
    requestId: input.requestId,
    amount,
    currency: input.currency,
    method: input.method,
  };
}

export function readExecuteFingerprint(meta: unknown): ExecuteFingerprint | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const row = meta as Record<string, unknown>;
  if (row.kind !== 'execute') {
    return null;
  }
  if (
    typeof row.requestId !== 'string' ||
    typeof row.amount !== 'string' ||
    typeof row.currency !== 'string' ||
    typeof row.method !== 'string'
  ) {
    return null;
  }
  return {
    kind: 'execute',
    requestId: row.requestId,
    amount: row.amount,
    currency: row.currency,
    method: row.method,
  };
}

export function executeFingerprintsMatch(
  left: ExecuteFingerprint,
  right: ExecuteFingerprint,
): boolean {
  return (
    left.requestId === right.requestId &&
    left.amount === right.amount &&
    left.currency === right.currency &&
    left.method === right.method
  );
}

export function assertMaskedDestinationHint(raw: string): string {
  const hint = raw.trim();
  if (hint.length < 3 || hint.length > 128) {
    throw new Error('DESTINATION_HINT_LENGTH');
  }
  if (CONSECUTIVE_DIGITS.test(hint)) {
    throw new Error('DESTINATION_HINT_FULL_ACCOUNT');
  }
  if (!MASK_MARK.test(hint)) {
    throw new Error('DESTINATION_HINT_NOT_MASKED');
  }
  return hint;
}

export function hasSuccessfulTransferEvidence(attempt: {
  status: RefundAttemptStatus | string;
  bankTransactionReference?: string | null;
  transferredAt?: Date | string | null;
}): boolean {
  if (attempt.status === RefundAttemptStatus.SUCCEEDED || attempt.status === 'SUCCEEDED') {
    return true;
  }
  return Boolean(attempt.bankTransactionReference?.trim() && attempt.transferredAt);
}

export function isOpenAttemptStatus(status: RefundAttemptStatus | string): boolean {
  return status === RefundAttemptStatus.SENT ||
    status === RefundAttemptStatus.UNCONFIRMED ||
    status === 'SENT' ||
    status === 'UNCONFIRMED';
}

export function isRecoverableCompleteStatus(status: RefundAttemptStatus | string): boolean {
  return isOpenAttemptStatus(status);
}
