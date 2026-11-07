export const REFUND_AUDIT_METADATA_KEYS = [
  'requestId',
  'orderId',
  'paymentId',
  'amount',
  'currency',
  'status',
  'intendedMethod',
  'esimGate',
  'requiresManualReview',
  'reasonLength',
  'attemptId',
  'attemptStatus',
  'reconStatus',
  'bankTransactionReference',
  'transferredAt',
  'destinationHintPresent',
  'errorCode',
  'esimReviewCleared',
  'replayed',
  'statementEvidenceRef',
  'orderMarkedRefunded',
  'orderPaymentStatus',
] as const;

export type RefundAuditMetadata = {
  requestId: string;
  orderId: string;
  paymentId: string;
  amount: string;
  currency: string;
  status: string;
  intendedMethod: string;
  esimGate: string;
  requiresManualReview: boolean;
  reasonLength?: number;
  attemptId?: string;
  attemptStatus?: string;
  reconStatus?: string;
  bankTransactionReference?: string;
  transferredAt?: string;
  destinationHintPresent?: boolean;
  errorCode?: string;
  esimReviewCleared?: boolean;
  replayed?: boolean;
  statementEvidenceRef?: string;
  orderMarkedRefunded?: boolean;
  orderPaymentStatus?: string;
};

const SENSITIVE_KEY_PATTERN =
  /(secret|password|pin|lpa|sm[-_]?dp|payload|gatewayResponse|authorization|token|cookie)/i;

export function buildRefundAuditMetadata(
  input: RefundAuditMetadata,
): Record<string, string | number | boolean> {
  const metadata: Record<string, string | number | boolean> = {};
  for (const key of REFUND_AUDIT_METADATA_KEYS) {
    const value = input[key];
    if (value !== undefined) {
      metadata[key] = value;
    }
  }
  return metadata;
}

export function refundAuditContainsSensitiveData(
  metadata: Record<string, unknown>,
): boolean {
  return Object.keys(metadata).some((key) => SENSITIVE_KEY_PATTERN.test(key));
}

export function sanitizeRefundAuditMetadata(
  metadata: unknown,
): Record<string, string | number | boolean> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  const row = metadata as Record<string, unknown>;
  const allowed = new Set<string>(REFUND_AUDIT_METADATA_KEYS);
  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!allowed.has(key) || SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
