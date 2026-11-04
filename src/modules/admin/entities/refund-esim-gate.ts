import { RefundEsimGate } from '@prisma/client';

const GATE_RANK: Record<RefundEsimGate, number> = {
  [RefundEsimGate.NONE]: 0,
  [RefundEsimGate.CREATE_UNCLEAR]: 1,
  [RefundEsimGate.HAS_REFERENCE]: 2,
  [RefundEsimGate.ISSUED]: 3,
};

export type RefundEsimAttemptInput = {
  operation: string;
  outcome: string;
  providerReference?: string | null;
  openGuard?: string | null;
};

export type RefundEsimGateInput = {
  hasProfile: boolean;
  hasLpaRevealAudit: boolean;
  attempts: RefundEsimAttemptInput[];
};

function isCreateUnclear(attempt: RefundEsimAttemptInput): boolean {
  if (attempt.operation !== 'CREATE') {
    return false;
  }
  if (attempt.openGuard) {
    return true;
  }
  return (
    attempt.outcome === 'UNCONFIRMED' ||
    attempt.outcome === 'SENT' ||
    (attempt.outcome === 'CONFIRMED_CREATED' && !attempt.providerReference)
  );
}

function pickHighest(left: RefundEsimGate, right: RefundEsimGate): RefundEsimGate {
  return GATE_RANK[right] > GATE_RANK[left] ? right : left;
}

/** ISSUED > HAS_REFERENCE > CREATE_UNCLEAR > NONE. Fulfillment FAILED is ignored. */
export function resolveRefundEsimGate(input: RefundEsimGateInput): RefundEsimGate {
  let gate: RefundEsimGate = RefundEsimGate.NONE;

  if (input.hasProfile || input.hasLpaRevealAudit) {
    gate = pickHighest(gate, RefundEsimGate.ISSUED);
  }

  const hasReference = input.attempts.some((attempt) => {
    const reference = attempt.providerReference?.trim();
    return Boolean(reference);
  });
  if (hasReference) {
    gate = pickHighest(gate, RefundEsimGate.HAS_REFERENCE);
  }

  if (input.attempts.some(isCreateUnclear)) {
    gate = pickHighest(gate, RefundEsimGate.CREATE_UNCLEAR);
  }

  return gate;
}
