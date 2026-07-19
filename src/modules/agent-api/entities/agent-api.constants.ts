export const AGENT_API_HEADERS = {
  API_KEY: 'x-api-key',
  SIGNATURE: 'x-signature',
  REQUEST_ID: 'x-request-id',
} as const;

export const AGENT_API_PREFIX = 'api/partner/v1';

export const AGENT_PARTNER_FAILURE_CODES = [
  'OUT_OF_STOCK',
  'LOW_BALANCE',
  'INVALID_SKU',
] as const;

export const AGENT_PARTNER_UNCERTAIN_CODES = ['TIMEOUT'] as const;

export type AgentPartnerTransactionStatus =
  | 'SUCCESS'
  | 'PROCESSING'
  | 'FAILED';

export const AGENT_PARTNER_ERROR_MESSAGES: Record<string, string> = {
  OUT_OF_STOCK: 'Product temporarily unavailable',
  LOW_BALANCE: 'Service temporarily unavailable',
  TIMEOUT: 'Transaction is being processed',
  INVALID_SKU: 'Product not available',
  UNKNOWN: 'Transaction could not be completed',
  PROVIDER_ERROR: 'Service temporarily unavailable',
};
