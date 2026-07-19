export type AgentStatus = 'PENDING_KYC' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type KycStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEED_MORE_INFO';
export type LedgerEntryType = 'CREDIT' | 'HOLD' | 'DEBIT' | 'RELEASE';
export type PartnerTransactionStatus = 'SUCCESS' | 'PROCESSING' | 'FAILED';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  emailVerified: boolean;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface AgentBalance {
  balance: string;
  heldBalance: string;
  availableBalance: string;
  currency: 'VND';
}

export interface AgentKyc {
  id: string;
  agentId: string;
  accountType?: string | null;
  profile?: Record<string, unknown> | null;
  documents?: Record<string, string> | null;
  businessProfile?: Record<string, unknown> | null;
  reviewNote?: string | null;
  companyName: string;
  taxCode: string;
  representativeName: string;
  documentFront: string;
  documentBack: string;
  businessLicense: string;
  status: KycStatus;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentProfile {
  id: string;
  userId: string;
  companyName: string;
  status: AgentStatus;
  contactEmail: string | null;
  apiEnabled: boolean;
  createdAt: string;
  kyc: AgentKyc | null;
  balance: AgentBalance;
}

export interface SubmitKycPayload {
  accountType: import('./kyc').AgentAccountType;
  profile: Record<string, unknown>;
  documents: Record<string, string>;
  businessProfile: Record<string, unknown>;
}

export interface RegisterAgentPayload {
  companyName: string;
  contactEmail?: string;
}

export interface LedgerEntry {
  id: string;
  type: LedgerEntryType;
  amount: string;
  beforeBalance: string;
  afterBalance: string;
  beforeHeld: string;
  afterHeld: string;
  referenceType: string;
  referenceId: string;
  description: string | null;
  createdAt: string;
}

export interface AgentTransactionSummary {
  request_id: string;
  product_code: string;
  product_name: string;
  amount: string;
  status: PartnerTransactionStatus;
  created_at: string;
}

export interface PartnerCard {
  card_serial: string;
  card_pin: string;
}

export interface AgentTransactionDetail {
  request_id: string;
  status: PartnerTransactionStatus;
  product_code?: string;
  quantity?: number;
  amount?: string;
  cards?: PartnerCard[];
  error?: { code: string; message: string };
}

export interface AgentCredentialsStatus {
  hasCredentials: boolean;
  apiEnabled: boolean;
  apiKeyMasked: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  status: 'ACTIVE' | 'INACTIVE';
}
