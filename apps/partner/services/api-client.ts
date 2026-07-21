import { getApiBaseUrl } from '@/lib/utils';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setAuthSession,
} from '@/lib/auth-storage';
import type {
  AgentCredentialsStatus,
  AgentProfile,
  AgentTransactionDetail,
  AgentTransactionSummary,
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthResult,
  LedgerEntry,
  RegisterAgentPayload,
  SubmitKycPayload,
} from '@/types/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  formData?: boolean;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiClientError(
      response.ok ? 'Phản hồi API không hợp lệ (không phải JSON)' : `Yêu cầu thất bại (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!response.ok || !('success' in payload) || !payload.success) {
    const errorPayload = payload as ApiErrorResponse;
    const code = errorPayload.error?.code;
    const message =
      code === 'RATE_LIMITED'
        ? 'Quá nhiều lần đăng nhập. Vui lòng đợi vài phút rồi thử lại.'
        : (errorPayload.error?.message ?? 'Yêu cầu thất bại');
    throw new ApiClientError(message, response.status, code);
  }

  return payload.data;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    clearAuthSession();
    return null;
  }

  const data = await parseResponse<Omit<AuthResult, 'user'>>(response);
  setAuthSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: getStoredUser(),
  });
  return data.accessToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const isForm = options.formData === true;
  const headers: Record<string, string> = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  };

  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const body = isForm
    ? (options.body as BodyInit)
    : options.body
      ? JSON.stringify(options.body)
      : undefined;

  let response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    cache: 'no-store',
  });

  if (response.status === 401 && options.auth !== false && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body,
        cache: 'no-store',
      });
    }
  }

  return parseResponse<T>(response);
}

export const authApi = {
  login(email: string, password: string) {
    return apiRequest<AuthResult>('/auth/login', {
      method: 'POST',
      body: { identifier: email, password },
      auth: false,
    });
  },
  logout(refreshToken?: string) {
    return apiRequest<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    });
  },
  verifyEmail(token: string) {
    return apiRequest<{ message: string; emailVerified: boolean }>('/auth/verify-email', {
      method: 'POST',
      body: { token },
      auth: false,
    });
  },
  resendVerification(email: string) {
    return apiRequest<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: { email },
      auth: false,
    });
  },
};

export const agentApi = {
  getOnboardingStatus() {
    return apiRequest<import('@/types/onboarding').OnboardingStatus>('/agents/me/onboarding-status');
  },
  register(payload: RegisterAgentPayload) {
    return apiRequest<AgentProfile>('/agents/register', {
      method: 'POST',
      body: payload,
    });
  },
  getMe() {
    return apiRequest<AgentProfile>('/agents/me');
  },
  changePassword(body: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    return apiRequest<{ message: string }>('/agents/me/change-password', { method: 'POST', body });
  },
  getKyc() {
    return apiRequest<import('@/types/kyc').AgentKycDetail>('/agents/me/kyc');
  },
  uploadKycDocument(file: File, field: string) {
    const form = new FormData();
    form.append('file', file);
    form.append('field', field);
    return apiRequest<import('@/types/kyc').KycDocumentRef>('/agents/me/kyc/documents', {
      method: 'POST',
      body: form,
      formData: true,
    });
  },
  kycDocumentUrl(storageKey: string) {
    const params = new URLSearchParams({ key: storageKey });
    return `${getApiBaseUrl()}/agents/me/kyc/documents/file?${params}`;
  },
  async fetchKycDocumentBlob(storageKey: string): Promise<Blob> {
    const params = new URLSearchParams({ key: storageKey });
    const path = `/agents/me/kyc/documents/file?${params}`;
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response = await fetch(`${getApiBaseUrl()}${path}`, {
      headers,
      cache: 'no-store',
    });

    if (response.status === 401 && getRefreshToken()) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        headers.Authorization = `Bearer ${newToken}`;
        response = await fetch(`${getApiBaseUrl()}${path}`, {
          headers,
          cache: 'no-store',
        });
      }
    }

    if (!response.ok) {
      throw new ApiClientError('Không tải được tài liệu KYC', response.status);
    }
    return response.blob();
  },
  submitKyc(payload: SubmitKycPayload) {
    return apiRequest<{ agentId: string; kycStatus: string }>('/agents/kyc', {
      method: 'POST',
      body: payload,
    });
  },
  getLedger() {
    return apiRequest<LedgerEntry[]>('/agents/me/ledger');
  },
  listTransactions(skip = 0, take = 20) {
    const params = new URLSearchParams({
      skip: String(skip),
      take: String(take),
    });
    return apiRequest<AgentTransactionSummary[]>(
      `/agents/me/transactions?${params}`,
    );
  },
  getTransaction(requestId: string) {
    return apiRequest<AgentTransactionDetail>(
      `/agents/me/transactions/${encodeURIComponent(requestId)}`,
    );
  },
  getCredentials() {
    return apiRequest<AgentCredentialsStatus>('/agents/me/credentials');
  },
};

export const agentPlatformApi = {
  getSession() {
    return apiRequest<import('@/types/platform').AgentPlatformSession>('/agents/me/platform/session');
  },
  getDashboard() {
    return apiRequest<import('@/types/platform').AgentPlatformDashboard>('/agents/me/platform/dashboard');
  },
  getWallet() {
    return apiRequest<import('@/types/platform').AgentWalletOverview>('/agents/me/platform/wallet');
  },
  listOrders(status?: string, skip = 0, take = 20) {
    const params = new URLSearchParams({ skip: String(skip), take: String(take) });
    if (status) params.set('status', status);
    return apiRequest<import('@/types/platform').AgentPlatformOrder[]>(
      `/agents/me/platform/orders?${params}`,
    );
  },
  listProducts() {
    return apiRequest<import('@/types/platform').AgentPlatformPricingResponse>(
      '/agents/me/platform/products',
    );
  },
  getSettlement() {
    return apiRequest<Record<string, unknown>>('/agents/me/platform/settlement');
  },
  getReports() {
    return apiRequest<Record<string, unknown>>('/agents/me/platform/reports');
  },
  getApiCenter() {
    return apiRequest<import('@/types/platform').AgentPlatformApiCenter>('/agents/me/platform/api');
  },
  getWebhooks() {
    return apiRequest<import('@/types/platform').AgentPlatformWebhookCenter>('/agents/me/platform/webhooks');
  },
  listInvoices() {
    return apiRequest<import('@/types/platform').AgentPlatformInvoice[]>('/agents/me/platform/invoices');
  },
  getUsers() {
    return apiRequest<{ members: import('@/types/platform').AgentPlatformMember[]; roles: string[] }>(
      '/agents/me/platform/users',
    );
  },
  listNotifications() {
    return apiRequest<{ items: unknown[] }>('/agents/me/platform/notifications');
  },
};

export const organizationApi = {
  getOrganization() {
    return apiRequest<import('@/types/platform').AgentOrganizationOverview>('/agents/me/organization');
  },
  listUsers(filters: Record<string, string | number | undefined> = {}) {
    const q = orderQuery(filters);
    return apiRequest<import('@/types/platform').AgentOrganizationUsersPage>(`/agents/me/users${q}`);
  },
  inviteUser(body: { email: string; role: string; expiresInDays?: number }) {
    return apiRequest<{ id: string; email: string; inviteToken?: string }>('/agents/me/users', {
      method: 'POST',
      body,
    });
  },
  updateUser(id: string, body: { role?: string; status?: string; displayName?: string }) {
    return apiRequest<{ ok: boolean }>(`/agents/me/users/${id}`, { method: 'PUT', body });
  },
  deleteUser(id: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/users/${id}`, { method: 'DELETE' });
  },
  cancelInvite(inviteId: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/users/invites/${inviteId}/cancel`, { method: 'POST' });
  },
  getPermissionMatrix() {
    return apiRequest<import('@/types/platform').AgentPermissionMatrix>('/agents/me/permissions/matrix');
  },
  listLoginHistory(page = 1) {
    return apiRequest<{ items: import('@/types/platform').AgentLoginHistoryEntry[]; total: number }>(
      `/agents/me/login-history?page=${page}&limit=20`,
    );
  },
  listSessions() {
    return apiRequest<{ items: import('@/types/platform').AgentSessionEntry[] }>('/agents/me/sessions');
  },
  revokeSession(id: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/sessions/${id}/revoke`, { method: 'POST' });
  },
  revokeOtherSessions() {
    return apiRequest<{ ok: boolean }>('/agents/me/sessions/revoke-others', { method: 'POST' });
  },
};

function orderQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const orderOperationsApi = {
  getStatistics() {
    return apiRequest<import('@/types/platform').AgentOrderStatistics>('/agents/me/orders/statistics');
  },
  listOrders(filters: import('@/types/platform').AgentOrderListFilters = {}) {
    return apiRequest<import('@/types/platform').AgentOrderListPage>(
      `/agents/me/orders${orderQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  search(q: string, skip = 0, take = 25) {
    return apiRequest<import('@/types/platform').AgentOrderListPage>(
      `/agents/me/orders/search${orderQuery({ q, skip, take })}`,
    );
  },
  getOrder(id: string, reveal = false) {
    const params = reveal ? '?reveal=true' : '';
    return apiRequest<import('@/types/platform').AgentOrderDetail>(`/agents/me/orders/${id}${params}`);
  },
  getTimeline(orderId: string) {
    return apiRequest<{ orderId: string; steps: unknown[]; lifecycle: unknown[] }>(
      `/agents/me/orders/timeline${orderQuery({ orderId })}`,
    );
  },
  listWebhooks(filters: { skip?: number; take?: number; orderId?: string } = {}) {
    return apiRequest<{ items: import('@/types/platform').AgentOrderWebhookEntry[]; total: number }>(
      `/agents/me/orders/webhooks${orderQuery(filters)}`,
    );
  },
  listLogs(filters: { skip?: number; take?: number; search?: string } = {}) {
    return apiRequest<{ items: unknown[]; total: number }>(
      `/agents/me/orders/logs${orderQuery(filters)}`,
    );
  },
  export(format: 'csv' | 'excel' | 'pdf' | 'json', filters: import('@/types/platform').AgentOrderListFilters = {}) {
    return apiRequest<{ mode: 'immediate' | 'background'; format?: string; rows?: unknown[]; jobId?: string; rowCount?: number; status?: string }>(
      `/agents/me/orders/export${orderQuery({ format, ...filters })}`,
    );
  },
  getExportJob(jobId: string) {
    return apiRequest<{ jobId: string; status: string; format: string; rowCount?: number; data?: unknown }>(
      `/agents/me/orders/export/${jobId}`,
    );
  },
  retryOrder(id: string) {
    return apiRequest<{ ok: boolean; fulfillmentStatus: string }>(`/agents/me/orders/${id}/retry`, {
      method: 'POST',
    });
  },
  audit(action: 'view_detail' | 'filter' | 'export' | 'retry' | 'search' | 'timeline', metadata?: Record<string, unknown>) {
    return apiRequest<{ ok: boolean }>('/agents/me/orders/audit', {
      method: 'POST',
      body: { action, metadata },
    });
  },
};

function walletQuery(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const walletApi = {
  getOverview() {
    return apiRequest<import('@/types/platform').AgentWalletOverviewExtended>('/agents/me/wallet');
  },
  getSummary(dateFrom?: string, dateTo?: string) {
    return apiRequest<Record<string, unknown>>(
      `/agents/me/wallet/summary${walletQuery({ dateFrom, dateTo })}`,
    );
  },
  listLedger(filters: import('@/types/platform').WalletLedgerFilters = {}) {
    return apiRequest<import('@/types/platform').WalletLedgerPage>(
      `/agents/me/wallet/ledger${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  getLedgerDetail(id: string) {
    return apiRequest<Record<string, unknown>>(`/agents/me/wallet/ledger/${id}`);
  },
  listDeposits(filters: import('@/types/platform').WalletLedgerFilters = {}) {
    return apiRequest<{ items: import('@/types/platform').WalletDepositRow[]; total: number }>(
      `/agents/me/wallet/deposits${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  listWithdraws(filters: import('@/types/platform').WalletLedgerFilters = {}) {
    return apiRequest<{ items: unknown[]; total: number; foundation?: boolean }>(
      `/agents/me/wallet/withdraws${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  getLimits() {
    return apiRequest<import('@/types/platform').WalletLimits>('/agents/me/wallet/limits');
  },
  getActivity() {
    return apiRequest<import('@/types/platform').WalletRecentActivity>('/agents/me/wallet/activity');
  },
  audit(action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf', metadata?: Record<string, unknown>) {
    return apiRequest<{ ok: boolean }>('/agents/me/wallet/audit', {
      method: 'POST',
      body: { action, metadata },
    });
  },
};

export const financeApi = {
  getOverview() {
    return apiRequest<import('@/types/platform').AgentFinanceOverview>('/agents/me/finance/overview');
  },
  listDeposits(filters: import('@/types/platform').FinanceHistoryFilters = {}) {
    return apiRequest<{
      items: import('@/types/platform').FinanceDepositRow[];
      total: number;
      gateways?: import('@/types/platform').FinanceDepositGateway[];
      readOnly?: boolean;
    }>(`/agents/me/finance/deposits${walletQuery(filters as Record<string, string | number | undefined>)}`);
  },
  getDeposit(id: string) {
    return apiRequest<import('@/types/platform').FinanceDepositDetail>(`/agents/me/finance/deposits/${id}`);
  },
  createDeposit(amount: number, gateway?: string, idempotencyKey?: string) {
    return apiRequest<import('@/types/platform').FinanceDepositDetail>('/agents/me/finance/deposits', {
      method: 'POST',
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
      body: { amount, gateway },
    });
  },
  refreshDeposit(id: string) {
    return apiRequest<import('@/types/platform').FinanceDepositDetail>(`/agents/me/finance/deposits/${id}/refresh`, {
      method: 'POST',
    });
  },
  listWithdraws(filters: import('@/types/platform').FinanceHistoryFilters = {}) {
    return apiRequest<{ items: import('@/types/platform').FinanceWithdrawRow[]; total: number; foundation?: boolean }>(
      `/agents/me/finance/withdraws${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  listSettlements(filters: import('@/types/platform').FinanceHistoryFilters = {}) {
    return apiRequest<{ items: import('@/types/platform').FinanceSettlementRow[]; total: number; readOnly: boolean }>(
      `/agents/me/finance/settlements${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  getSettlement(id: string) {
    return apiRequest<import('@/types/platform').FinanceSettlementDetail>(`/agents/me/finance/settlements/${id}`);
  },
  listAdjustments(filters: import('@/types/platform').FinanceHistoryFilters = {}) {
    return apiRequest<{ items: import('@/types/platform').FinanceAdjustmentRow[]; total: number }>(
      `/agents/me/finance/adjustments${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  getCredit() {
    return apiRequest<import('@/types/platform').FinanceCreditInfo>('/agents/me/finance/credit');
  },
  listHistory(filters: import('@/types/platform').FinanceHistoryFilters = {}) {
    return apiRequest<import('@/types/platform').FinanceHistoryPage>(
      `/agents/me/finance/history${walletQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  listNotifications() {
    return apiRequest<{ items: unknown[] }>('/agents/me/finance/notifications');
  },
  audit(action: 'view_detail' | 'filter' | 'export_csv' | 'export_excel' | 'export_pdf', metadata?: Record<string, unknown>) {
    return apiRequest<{ ok: boolean }>('/agents/me/finance/audit', {
      method: 'POST',
      body: { action, metadata },
    });
  },
};

export const securityApi = {
  getDashboard() {
    return apiRequest<import('@/types/platform').AgentSecurityDashboard>('/agents/me/security/dashboard');
  },
  getApiKeys() {
    return apiRequest<import('@/types/platform').AgentSecurityApiKeys>('/agents/me/security/api-keys');
  },
  rotateApiKey() {
    return apiRequest<{ apiKey: string; secretKey: string; message: string }>(
      '/agents/me/security/api-keys/rotate',
      { method: 'POST' },
    );
  },
  disableApiKey() {
    return apiRequest<{ ok: boolean }>('/agents/me/security/api-keys/disable', { method: 'POST' });
  },
  enableApiKey() {
    return apiRequest<{ ok: boolean }>('/agents/me/security/api-keys/enable', { method: 'POST' });
  },
  renameApiKey(label: string) {
    return apiRequest<{ ok: boolean }>('/agents/me/security/api-keys/rename', {
      method: 'PATCH',
      body: { label },
    });
  },
  updateApiKeyMeta(body: { environment?: string; expiresAt?: string | null }) {
    return apiRequest<{ ok: boolean }>('/agents/me/security/api-keys', { method: 'PATCH', body });
  },
  listIpWhitelist(search?: string) {
    const q = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<{ items: import('@/types/platform').AgentIpWhitelistEntry[]; total: number }>(
      `/agents/me/security/ip-whitelist${q}`,
    );
  },
  createIpWhitelist(body: { cidr: string; description?: string }) {
    return apiRequest<import('@/types/platform').AgentIpWhitelistEntry>(
      '/agents/me/security/ip-whitelist',
      { method: 'POST', body },
    );
  },
  updateIpWhitelist(id: string, body: { cidr?: string; description?: string; enabled?: boolean }) {
    return apiRequest<import('@/types/platform').AgentIpWhitelistEntry>(
      `/agents/me/security/ip-whitelist/${id}`,
      { method: 'PATCH', body },
    );
  },
  deleteIpWhitelist(id: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/security/ip-whitelist/${id}`, { method: 'DELETE' });
  },
  getWebhook() {
    return apiRequest<import('@/types/platform').AgentSecurityWebhook>('/agents/me/security/webhook');
  },
  updateWebhook(body: { callbackUrl?: string; enabled?: boolean; events?: unknown[] }) {
    return apiRequest<import('@/types/platform').AgentSecurityWebhook>(
      '/agents/me/security/webhook',
      { method: 'PUT', body },
    );
  },
  rotateWebhookSecret() {
    return apiRequest<{ secret: string; message: string }>(
      '/agents/me/security/webhook/rotate-secret',
      { method: 'POST' },
    );
  },
  getRateLimit() {
    return apiRequest<import('@/types/platform').AgentSecurityRateLimit>('/agents/me/security/rate-limit');
  },
  listLogs(type?: string, search?: string, take = 50) {
    const q = new URLSearchParams();
    if (type) q.set('type', type);
    if (search) q.set('search', search);
    q.set('take', String(take));
    return apiRequest<{ items: import('@/types/platform').AgentApiLogEntry[]; total: number }>(
      `/agents/me/security/logs?${q}`,
    );
  },
  listEvents(take = 50) {
    return apiRequest<{ items: import('@/types/platform').AgentSecurityEvent[]; total: number }>(
      `/agents/me/security/events?take=${take}`,
    );
  },
};

export const webhookDeliveryApi = {
  list(filters: {
    page?: number;
    limit?: number;
    tab?: 'history' | 'failed' | 'retry';
    search?: string;
    status?: string;
    event?: string;
    httpStatus?: number;
    gateway?: string;
    provider?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}) {
    return apiRequest<import('@/types/platform').WebhookDeliveryListPage>(
      `/agents/me/webhooks/deliveries${orderQuery(filters as Record<string, string | number | undefined>)}`,
    );
  },
  getStatistics() {
    return apiRequest<import('@/types/platform').WebhookDeliveryStatistics>(
      '/agents/me/webhooks/statistics',
    );
  },
  getDetail(id: string) {
    return apiRequest<import('@/types/platform').WebhookDeliveryDetail>(
      `/agents/me/webhooks/deliveries/${id}`,
    );
  },
  retry(id: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/webhooks/deliveries/${id}/retry`, { method: 'POST' });
  },
  cancel(id: string) {
    return apiRequest<{ ok: boolean }>(`/agents/me/webhooks/deliveries/${id}/cancel`, { method: 'POST' });
  },
};

export const apiOpsApi = {
  listLogs(filters: Record<string, string | number | undefined> = {}) {
    return apiRequest<import('@/types/platform').AgentApiLogListPage>(
      `/agents/me/api-ops/logs${orderQuery(filters)}`,
    );
  },
  getLog(id: string) {
    return apiRequest<import('@/types/platform').AgentApiLogDetail>(`/agents/me/api-ops/logs/${id}`);
  },
  exportLogs(format: 'csv' | 'excel' | 'json', filters: Record<string, unknown> = {}) {
    return apiRequest<{ mode: 'immediate' | 'background'; format?: string; rows?: unknown[]; jobId?: string; rowCount?: number; status?: string }>(
      '/agents/me/api-ops/logs/export',
      { method: 'POST', body: { format, filters } },
    );
  },
  getExportJob(jobId: string) {
    return apiRequest<{ id: string; status: string; rowCount?: number; data?: unknown }>(
      `/agents/me/api-ops/logs/export/${jobId}`,
    );
  },
  getUsage(period: 'today' | '7d' | '30d' = 'today') {
    return apiRequest<import('@/types/platform').AgentApiUsageStats>(
      `/agents/me/api-ops/usage?period=${period}`,
    );
  },
  getErrorCodes() {
    return apiRequest<{ items: import('@/types/platform').ApiErrorCodeDoc[] }>('/agents/me/api-ops/error-codes');
  },
  test(body: {
    method: 'GET' | 'POST';
    path: string;
    apiKey: string;
    secretKey: string;
    requestId: string;
    body?: Record<string, unknown>;
  }) {
    return apiRequest<{
      ok: boolean;
      status: number;
      latencyMs: number;
      request: unknown;
      response: unknown;
      curl: string;
    }>('/agents/me/api-ops/test', { method: 'POST', body });
  },
};
