export type AgentApiKeyEnvironment = 'PRODUCTION' | 'SANDBOX';

export interface AgentIpWhitelistEntry {
  id: string;
  cidr: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AgentSecurityConfig {
  apiKeyLabel?: string;
  apiKeyEnvironment?: AgentApiKeyEnvironment;
  apiKeyExpiresAt?: string | null;
  apiKeyDisabledAt?: string | null;
  lastUsedIp?: string | null;
  ipWhitelist?: AgentIpWhitelistEntry[];
  webhookSecretHistory?: Array<{ at: string; by: string; action: string }>;
}

export const AGENT_SECURITY_SIGNATURE_ALGORITHM = 'HMAC-SHA256';

export type AgentApiLogType =
  | 'AUTH_SUCCESS'
  | 'AUTH_401'
  | 'AUTH_403'
  | 'AUTH_429'
  | 'INVALID_KEY'
  | 'INVALID_SIGNATURE'
  | 'BLOCKED_IP'
  | 'EXPIRED_KEY'
  | 'FORBIDDEN';

export interface AgentApiLogEntry {
  id: string;
  at: string;
  type: AgentApiLogType;
  ip: string | null;
  path: string | null;
  method: string | null;
  message: string;
}

export interface AgentSecurityEventEntry {
  id: string;
  at: string;
  type: string;
  title: string;
  description: string | null;
  severity: string;
  ip: string | null;
}
