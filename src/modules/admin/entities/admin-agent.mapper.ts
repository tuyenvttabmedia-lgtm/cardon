import { Agent, AgentKyc, User } from '@prisma/client';
import { decimalToString } from '../../order/entities/order.mapper';

const SENSITIVE_AGENT_FIELDS = [
  'apiKeyHash',
  'secretKeyEncrypted',
  'apiKeyLookup',
] as const;

export interface AdminAgentView {
  id: string;
  userId: string;
  companyName: string;
  balance: string;
  heldBalance: string;
  hasApiCredentials: boolean;
  lastUsedAt: string | null;
  contactEmail: string | null;
  rateLimit: number;
  apiEnabled: boolean;
  status: Agent['status'];
  createdAt: string;
  updatedAt: string;
  kyc?: Pick<AgentKyc, 'status'> | AgentKyc;
  user?: Pick<User, 'id' | 'email'> & Partial<Pick<User, 'role'>>;
}

type AgentWithRelations = Agent & {
  kyc?: AgentKyc | Pick<AgentKyc, 'status'> | null;
  user?: (Pick<User, 'id' | 'email'> & Partial<Pick<User, 'role'>>) | null;
};

export function mapAdminAgent(agent: AgentWithRelations): AdminAgentView {
  const view: AdminAgentView = {
    id: agent.id,
    userId: agent.userId,
    companyName: agent.companyName,
    balance: decimalToString(agent.balance),
    heldBalance: decimalToString(agent.heldBalance),
    hasApiCredentials: Boolean(agent.apiKeyHash),
    lastUsedAt: agent.lastUsedAt?.toISOString() ?? null,
    contactEmail: agent.contactEmail,
    rateLimit: agent.rateLimit,
    apiEnabled: agent.apiEnabled,
    status: agent.status,
    createdAt: agent.createdAt.toISOString(),
    updatedAt: agent.updatedAt.toISOString(),
  };

  if (agent.kyc) {
    view.kyc = agent.kyc;
  }
  if (agent.user) {
    view.user = agent.user;
  }

  return view;
}

export function assertAdminAgentResponseSafe(payload: unknown): void {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  for (const field of SENSITIVE_AGENT_FIELDS) {
    if (field in (payload as Record<string, unknown>)) {
      throw new Error(`Admin agent response must not expose ${field}`);
    }
  }
}
