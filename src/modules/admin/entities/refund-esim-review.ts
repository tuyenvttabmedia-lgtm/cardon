import { RefundEsimGate } from '@prisma/client';

export type RefundEsimReviewEvidence = {
  esimReviewCleared?: boolean;
  esimReviewClearedAt?: string;
  esimReviewClearedById?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function readEsimReviewEvidence(value: unknown): RefundEsimReviewEvidence {
  const row = asRecord(value);
  return {
    esimReviewCleared: row.esimReviewCleared === true,
    esimReviewClearedAt:
      typeof row.esimReviewClearedAt === 'string' ? row.esimReviewClearedAt : undefined,
    esimReviewClearedById:
      typeof row.esimReviewClearedById === 'string' ? row.esimReviewClearedById : undefined,
  };
}

export function isEsimReviewCleared(value: unknown): boolean {
  const review = readEsimReviewEvidence(value);
  return review.esimReviewCleared === true && Boolean(review.esimReviewClearedById);
}

export function canExecuteEsimGate(
  gate: RefundEsimGate,
  evidence: unknown,
): boolean {
  if (gate === RefundEsimGate.NONE) {
    return true;
  }
  return isEsimReviewCleared(evidence);
}

export function buildClearedEsimReviewEvidence(
  current: unknown,
  actorId: string,
  clearedAt: Date,
): Record<string, unknown> {
  return {
    ...asRecord(current),
    esimReviewCleared: true,
    esimReviewClearedAt: clearedAt.toISOString(),
    esimReviewClearedById: actorId,
  };
}
