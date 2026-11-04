export interface CloseQueryClaimCandidate {
  queryAttemptId: string;
  createAttemptId: string;
}

export function selectCloseQueryClaim(
  attempts: Array<{ id: string; operation: string; outcome: string }>,
): CloseQueryClaimCandidate | null {
  const queries = attempts.filter(
    (attempt) => attempt.operation === 'QUERY' && attempt.outcome === 'SENT',
  );
  const creates = attempts.filter((attempt) => attempt.operation === 'CREATE');
  if (queries.length !== 1 || creates.length !== 1) {
    return null;
  }
  return {
    queryAttemptId: queries[0].id,
    createAttemptId: creates[0].id,
  };
}
