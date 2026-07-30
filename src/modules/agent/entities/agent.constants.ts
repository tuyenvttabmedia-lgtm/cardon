export const AGENT_AUDIT_ACTIONS = {
  AGENT_REGISTERED: 'AGENT_REGISTERED',
  KYC_SUBMITTED: 'KYC_SUBMITTED',
  KYC_APPROVED: 'KYC_APPROVED',
  KYC_REJECTED: 'KYC_REJECTED',
  KYC_NEED_MORE_INFO: 'KYC_NEED_MORE_INFO',
  AGENT_CREDITED: 'AGENT_CREDITED',
  AGENT_SUSPENDED: 'AGENT_SUSPENDED',
  AGENT_API_KEY_GENERATED: 'AGENT_API_KEY_GENERATED',
} as const;

export const AGENT_API_KEY_PREFIX = 'ak_';
/** Sandbox partner keys (issued after KYC). */
export const AGENT_API_KEY_SANDBOX_PREFIX = 'ak_test_';
/** Production partner keys (after live enable). */
export const AGENT_API_KEY_LIVE_PREFIX = 'ak_live_';
export const AGENT_SECRET_KEY_PREFIX = 'sk_';
/** Seeded sandbox balance after KYC (VND). */
export const AGENT_SANDBOX_SEED_BALANCE = 10_000_000;
