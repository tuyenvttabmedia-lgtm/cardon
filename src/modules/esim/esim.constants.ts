/** Prefix on every mock install blob so it cannot be mistaken for a live eSIM. */
export const ESIM_TEST_MARKER = 'TEST-ESIM-NOT-REAL';

/** Fake installation string. Not a carrier SM-DP+ address. */
export const ESIM_TEST_LPA_PREFIX = 'TEST-LPA:1$test.invalid$';

export const ESIM_QUEUE = 'esim_queue' as const;

export const ESIM_QUEUE_JOB = {
  FULFILL: 'fulfill',
  /** GET/query an open CREATE that already has a stored provider reference. Never CREATE. */
  QUERY_OPEN: 'query_open',
} as const;

export function esimFulfillJobId(orderId: string): string {
  return `esim-fulfill-${orderId}`;
}

export function esimQueryOpenJobId(orderId: string): string {
  return `esim-query-open-${orderId}`;
}

export const ESIM_LIVE_HTTP_DISABLED = 'ESIM_LIVE_HTTP_DISABLED';

/** @deprecated Removed from sales path. Cleanup script deactivates remaining mappings. */
export const ESIM_GO_PROVIDER_CODE = 'ESIM_GO';

/** Sole live eSIM wholesale provider. Cards/topup never use this code. */
export const ESIM_AIRALO_PROVIDER_CODE = 'AIRALO';
