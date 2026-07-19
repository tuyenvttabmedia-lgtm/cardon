export const PROVIDER_CODES = {
  ESALE: 'ESALE',
  IMEDIA: 'IMEDIA',
} as const;

export type ProviderCode = (typeof PROVIDER_CODES)[keyof typeof PROVIDER_CODES];

export const PROVIDER_AUDIT_ACTIONS = {
  PROVIDER_ATTEMPT: 'PROVIDER_ATTEMPT',
  PROVIDER_SUCCESS: 'PROVIDER_SUCCESS',
  PROVIDER_FAILED: 'PROVIDER_FAILED',
  PROVIDER_RETRY: 'PROVIDER_RETRY',
} as const;

export const PROVIDER_QUEUE_JOB = {
  FULFILL: 'fulfill',
  RETRY: 'retry',
} as const;

export const TOPUP_QUEUE_JOB = {
  FULFILL: 'fulfill',
  RETRY: 'retry',
} as const;

export const DEFAULT_LOW_BALANCE_THRESHOLD = 5_000_000;

export const SYSTEM_PROVIDER_AUDIT_EMAIL = 'system@cardon.local';
