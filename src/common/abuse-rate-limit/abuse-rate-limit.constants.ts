export const ABUSE_KEY_PREFIX = 'cardon:abuse:';

export type AbuseBucket =
  | 'auth_register'
  | 'auth_agent_register'
  | 'auth_login'
  | 'support_ticket_create'
  | 'support_message'
  | 'support_upload'
  | 'kyc_submit'
  | 'kyc_document'
  | 'order_create';

export type AbuseDimension = 'ip' | 'userId' | 'emailHash';

export type AbuseBucketConfig = {
  limit: number;
  ttlSeconds: number;
  dimensions: AbuseDimension[];
};

const FIFTEEN_MIN = 15 * 60;
const ONE_HOUR = 60 * 60;
const ONE_DAY = 24 * 60 * 60;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Defaults match W2 owner-approved matrix; overridable via ENV. */
export function resolveAbuseBucketConfig(bucket: AbuseBucket): AbuseBucketConfig {
  switch (bucket) {
    case 'auth_register':
      return {
        limit: envInt('ABUSE_LIMIT_AUTH_REGISTER', 5),
        ttlSeconds: envInt('ABUSE_TTL_AUTH_REGISTER_SEC', FIFTEEN_MIN),
        dimensions: ['ip', 'emailHash'],
      };
    case 'auth_agent_register':
      return {
        limit: envInt('ABUSE_LIMIT_AUTH_AGENT_REGISTER', 5),
        ttlSeconds: envInt('ABUSE_TTL_AUTH_AGENT_REGISTER_SEC', FIFTEEN_MIN),
        dimensions: ['ip', 'emailHash'],
      };
    case 'auth_login':
      return {
        limit: envInt('ABUSE_LIMIT_AUTH_LOGIN', 5),
        ttlSeconds: envInt('ABUSE_TTL_AUTH_LOGIN_SEC', FIFTEEN_MIN),
        dimensions: ['ip'],
      };
    case 'support_ticket_create':
      return {
        limit: envInt('ABUSE_LIMIT_SUPPORT_TICKET', 3),
        ttlSeconds: envInt('ABUSE_TTL_SUPPORT_TICKET_SEC', ONE_HOUR),
        dimensions: ['userId', 'ip'],
      };
    case 'support_message':
      return {
        limit: envInt('ABUSE_LIMIT_SUPPORT_MESSAGE', 20),
        ttlSeconds: envInt('ABUSE_TTL_SUPPORT_MESSAGE_SEC', ONE_HOUR),
        dimensions: ['userId'],
      };
    case 'support_upload':
      return {
        limit: envInt('ABUSE_LIMIT_SUPPORT_UPLOAD', 10),
        ttlSeconds: envInt('ABUSE_TTL_SUPPORT_UPLOAD_SEC', ONE_HOUR),
        dimensions: ['userId'],
      };
    case 'kyc_submit':
      return {
        limit: envInt('ABUSE_LIMIT_KYC_SUBMIT', 3),
        ttlSeconds: envInt('ABUSE_TTL_KYC_SUBMIT_SEC', ONE_DAY),
        dimensions: ['userId'],
      };
    case 'kyc_document':
      return {
        limit: envInt('ABUSE_LIMIT_KYC_DOCUMENT', 20),
        ttlSeconds: envInt('ABUSE_TTL_KYC_DOCUMENT_SEC', ONE_DAY),
        dimensions: ['userId'],
      };
    case 'order_create':
      return {
        limit: envInt('ABUSE_LIMIT_ORDER_CREATE', 20),
        ttlSeconds: envInt('ABUSE_TTL_ORDER_CREATE_SEC', FIFTEEN_MIN),
        // Controller passes: guest → ip+email; auth → userId only (no shared IP with guests).
        dimensions: ['ip', 'userId', 'emailHash'],
      };
    default: {
      const _exhaustive: never = bucket;
      throw new Error(`Unknown abuse bucket: ${_exhaustive}`);
    }
  }
}

/** Atomic INCR + EXPIRE-on-first-hit. KEYS[1]=key ARGV[1]=ttlSeconds */
export const ABUSE_INCR_EXPIRE_LUA = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return n
`;
