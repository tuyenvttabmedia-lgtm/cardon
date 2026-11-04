import { describe, expect, it } from 'vitest';
import { selectCloseQueryClaim } from './esim-query-claim';

describe('selectCloseQueryClaim', () => {
  it('returns ids only when there is exactly one SENT QUERY and one CREATE', () => {
    expect(
      selectCloseQueryClaim([
        { id: 'create-1', operation: 'CREATE', outcome: 'SENT' },
        { id: 'query-1', operation: 'QUERY', outcome: 'SENT' },
      ]),
    ).toEqual({ queryAttemptId: 'query-1', createAttemptId: 'create-1' });
  });

  it('returns null when QUERY is not SENT or ids are ambiguous', () => {
    expect(
      selectCloseQueryClaim([
        { id: 'create-1', operation: 'CREATE', outcome: 'SENT' },
        { id: 'query-1', operation: 'QUERY', outcome: 'UNCONFIRMED' },
      ]),
    ).toBeNull();
    expect(
      selectCloseQueryClaim([
        { id: 'create-1', operation: 'CREATE', outcome: 'SENT' },
        { id: 'query-1', operation: 'QUERY', outcome: 'SENT' },
        { id: 'query-2', operation: 'QUERY', outcome: 'SENT' },
      ]),
    ).toBeNull();
    expect(
      selectCloseQueryClaim([
        { id: 'create-1', operation: 'CREATE', outcome: 'SENT' },
        { id: 'create-2', operation: 'CREATE', outcome: 'SENT' },
        { id: 'query-1', operation: 'QUERY', outcome: 'SENT' },
      ]),
    ).toBeNull();
  });
});
