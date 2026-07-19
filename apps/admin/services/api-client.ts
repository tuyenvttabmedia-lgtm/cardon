import { getApiBaseUrl, downloadBlob, downloadArrayBuffer } from '@/lib/utils';
import { stripSettingsReadonly } from '@/lib/settings-payload';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getStoredUser,
  setAuthSession,
} from '@/lib/auth-storage';
import type {
  AdminAgent,
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthResult,
  AuthUser,
  Category,
  DashboardStats,
  FulfillmentResult,
  HomeServiceType,
  Invoice,
  KycApproveResult,
  ManualReviewResponse,
  AdminPayment,
  Order,
  PaginatedResponse,
  Product,
  ProfitReport,
  ProviderBalanceCheck,
  ProviderMapping,
  ProviderProductSync,
  ProviderStatus,
  ProviderTransaction,
  ProductVariant,
  ReconcileReport,
  AgentStatement,
  CmsBanner,
  CmsPage,
  CmsSeoSettings,
  CmsCategory,
  CmsTag,
  CmsMedia,
  CmsThemeSettings,
  ContactMessage,
  SupportTicket,
  FaqCategory,
  FaqItem,
  FaqListResponse,
  AdminCustomer,
  AdminCustomerDetail,
  AdminOrderDetail,
  AdminOrderListItem,
  AdminOrderSummary,
  AdminStaff,
  AutoFixResponse,
  GlobalSearchResult,
  IntegrityReport,
  SystemHealthSummary,
  PaymentGatewaySettings,
  PaymentMethodConfig,
  GatewayFeesReport,
  ProviderEsaleSettings,
  SmtpSettings,
  SystemSettings,
  OrderSettings,
  TelegramSettings,
  SystemAuditLog,
  SystemAuditLogListResponse,
  SystemActivityLog,
  SystemActivityLogListResponse,
  SystemNotification,
  SystemNotificationListResponse,
  SystemNotificationStats,
  QueueMonitorDashboard,
  QueueMonitorJob,
  QueueMonitorJobDetail,
  QueueMonitorQueueRow,
  QueueMonitorStatistics,
  QueueMonitorHistory,
  QueueMonitorWorkerInfo,
  QueueMonitorConfig,
  WebhookMonitorListResponse,
  WebhookMonitorDetail,
  WebhookMonitorStatistics,
  WebhookMonitorHistory,
  ConfigurationOverview,
  ConfigurationSearchEntry,
  ConfigurationAuditMeta,
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
}

async function parseResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    const text = await response.text();
    if (!response.ok) {
      throw new ApiClientError(text || 'Export failed', response.status);
    }
    return text as T;
  }

  if (!contentType.includes('application/json')) {
    throw new ApiClientError(
      response.ok ? 'Phản hồi API không hợp lệ (không phải JSON)' : `Yêu cầu thất bại (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;
  if (!response.ok || !('success' in payload) || !payload.success) {
    const errorPayload = payload as ApiErrorResponse;
    throw new ApiClientError(
      errorPayload.error?.message ?? 'Yêu cầu thất bại',
      response.status,
      errorPayload.error?.code,
    );
  }
  return payload.data;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearAuthSession();
        }
        return null;
      }

      const data = await parseResponse<Omit<AuthResult, 'user'>>(response);
      setAuthSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: getStoredUser(),
      });
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Proactive session refresh (access token TTL ~15m). */
export async function refreshSession(): Promise<boolean> {
  const token = await refreshAccessToken();
  return token !== null;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response = await fetch(`${getApiBaseUrl()}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });

  if (response.status === 401 && options.auth !== false && getRefreshToken()) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.Authorization = `Bearer ${newToken}`;
      response = await fetch(`${getApiBaseUrl()}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
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
  me() {
    return apiRequest<AuthUser & { permissions: string[] }>('/auth/me');
  },
  logout(refreshToken?: string) {
    return apiRequest<{ message: string }>('/auth/logout', {
      method: 'POST',
      body: refreshToken ? { refreshToken } : {},
    });
  },
  changePassword(body: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    return apiRequest<{ message: string }>('/admin/me/change-password', { method: 'POST', body });
  },
};

export const adminApi = {
  getDashboard() {
    return apiRequest<DashboardStats>('/admin/dashboard');
  },
  listOrders(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<AdminOrderListItem[]>(`/admin/orders?${q}`);
  },
  getOrdersSummary(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<AdminOrderSummary>(`/admin/orders/summary?${q}`);
  },
  recordPinViewed(orderId: string, cardId: string) {
    return apiRequest<{ ok: boolean }>(
      `/admin/orders/${orderId}/cards/${cardId}/pin-viewed`,
      { method: 'POST' },
    );
  },
  recordPinCopied(orderId: string, cardId: string) {
    return apiRequest<{ ok: boolean }>(
      `/admin/orders/${orderId}/cards/${cardId}/pin-copied`,
      { method: 'POST' },
    );
  },
  getOrder(id: string) {
    return apiRequest<Order>(`/admin/orders/${id}`);
  },
  retryOrder(id: string) {
    return apiRequest<FulfillmentResult>(`/admin/orders/${id}/retry`, { method: 'POST' });
  },
  orderManualRecovery(
    id: string,
    action: 'retry' | 'switch_provider' | 'refund' | 'mark_fulfilled',
    body?: { providerId?: string; note?: string },
  ) {
    return apiRequest<FulfillmentResult | { orderId: string; fulfillmentStatus: string; manualRefund?: boolean; cardsDelivered?: number }>(
      `/admin/orders/${id}/recovery`,
      { method: 'POST', body: { action, ...body } },
    );
  },
  getManualReviewPayments() {
    return apiRequest<ManualReviewResponse>('/admin/payments/manual-review');
  },
  listPayments(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<PaginatedResponse<AdminPayment>>(`/admin/payments?${q}`);
  },
  resolvePayment(id: string, action: 'approve' | 'reject', reason?: string) {
    return apiRequest<unknown>(`/admin/payments/${id}/resolve`, {
      method: 'POST',
      body: { action, reason },
    });
  },
  getProvidersStatus() {
    return apiRequest<ProviderStatus[]>('/admin/providers/status');
  },
  listProviderTransactions(
    providerId: string,
    params: Record<string, string | number | undefined> = {},
  ) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<PaginatedResponse<ProviderTransaction>>(
      `/admin/providers/${providerId}/transactions?${q}`,
    );
  },
  checkProviderBalance(providerId: string) {
    return apiRequest<ProviderBalanceCheck>(
      `/admin/providers/${providerId}/check-balance`,
      { method: 'POST' },
    );
  },
  syncProviderProducts(providerId: string) {
    return apiRequest<ProviderProductSync>(
      `/admin/providers/${providerId}/sync-products`,
      { method: 'POST' },
    );
  },
  getProviderDetail(providerId: string) {
    return apiRequest<import('@/types/api').ProviderDetail>(`/admin/providers/${providerId}`);
  },
  testProviderConnection(providerId: string) {
    return apiRequest<import('@/types/api').ProviderConnectionTest>(
      `/admin/providers/${providerId}/test-connection`,
      { method: 'POST' },
    );
  },
  getProviderRuntimeSettings(providerId: string) {
    return apiRequest<import('@/types/api').ProviderRuntimeSettings>(
      `/admin/providers/${providerId}/runtime-settings`,
    );
  },
  updateProviderRuntimeSettings(
    providerId: string,
    body: Partial<import('@/types/api').ProviderRuntimeSettings>,
  ) {
    return apiRequest<import('@/types/api').ProviderRuntimeSettings>(
      `/admin/providers/${providerId}/runtime-settings`,
      { method: 'PUT', body },
    );
  },
  getProviderAlertSettings(providerId: string) {
    return apiRequest<import('@/types/api').ProviderAlertSettings>(
      `/admin/providers/${providerId}/alert-settings`,
    );
  },
  updateProviderAlertSettings(
    providerId: string,
    body: Partial<import('@/types/api').ProviderAlertSettings>,
  ) {
    return apiRequest<import('@/types/api').ProviderAlertSettings>(
      `/admin/providers/${providerId}/alert-settings`,
      { method: 'PUT', body },
    );
  },
  listNotifications(take = 50) {
    return apiRequest<SystemNotificationListResponse>(`/admin/notifications?limit=${take}`);
  },
  unreadNotificationCount() {
    return apiRequest<{ count: number }>('/admin/notifications/unread-count');
  },
  markNotificationRead(id: string) {
    return apiRequest<{ count: number }>(`/admin/notifications/${id}/read`, { method: 'PATCH' });
  },
  resendOrderEmail(orderId: string) {
    return apiRequest<{ ok: boolean }>(`/admin/orders/${orderId}/resend-email`, { method: 'POST' });
  },
  retryOrderDelivery(orderId: string) {
    return apiRequest<FulfillmentResult>(`/admin/orders/${orderId}/retry-delivery`, { method: 'POST' });
  },
  copyOrderSerial(orderId: string, cardRecordId: string) {
    return apiRequest<{ cardRecordId: string; serial: string }>(
      `/admin/orders/${orderId}/copy-serial`,
      { method: 'POST', body: { cardRecordId } },
    );
  },
  listAgents(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<AdminAgent[]>(`/admin/agents?${q}`);
  },
  getAgent(id: string) {
    return apiRequest<AdminAgent>(`/admin/agents/${id}`);
  },
  listAgentOrgUsers(agentId: string) {
    return apiRequest<{ items: Array<{ id: string; userId: string; email: string; name: string | null; role: string; status: string }> }>(
      `/admin/agents/${agentId}/organization/users`,
    );
  },
  impersonateAgent(agentId: string, targetUserId?: string) {
    return apiRequest<{
      accessToken: string;
      expiresIn: number;
      companyName?: string;
      platformRole?: string;
      partnerUrl: string;
    }>(`/admin/agents/${agentId}/impersonate`, {
      method: 'POST',
      body: targetUserId ? { targetUserId } : {},
    });
  },
  suspendAgent(id: string, reason?: string) {
    return apiRequest<{ agentId: string; status: string }>(`/admin/agents/${id}/suspend`, {
      method: 'POST',
      body: { reason },
    });
  },
  enableAgentApi(id: string) {
    return apiRequest<{ agentId: string; apiEnabled: boolean }>(
      `/admin/agents/${id}/enable-api`,
      { method: 'POST' },
    );
  },
  disableAgentApi(id: string) {
    return apiRequest<{ agentId: string; apiEnabled: boolean }>(
      `/admin/agents/${id}/disable-api`,
      { method: 'POST' },
    );
  },
  approveKyc(id: string) {
    return apiRequest<KycApproveResult>(`/admin/agents/${id}/kyc/approve`, { method: 'POST' });
  },
  rejectKyc(id: string, reason?: string) {
    return apiRequest<{ agentId: string; status: string }>(`/admin/agents/${id}/kyc/reject`, {
      method: 'POST',
      body: { reason },
    });
  },
  requestMoreInfoKyc(id: string, reason: string, fields?: string[]) {
    return apiRequest<{ agentId: string; status: string }>(
      `/admin/agents/${id}/kyc/request-more-info`,
      { method: 'POST', body: { reason, fields } },
    );
  },
  rotateAgentApiKeys(id: string) {
    return apiRequest<{ agentId: string; apiKey: string; secretKey: string; message: string }>(
      `/admin/agents/${id}/api-keys/rotate`,
      { method: 'POST' },
    );
  },
  creditAgent(id: string, amount: string, note?: string) {
    return apiRequest<unknown>(`/admin/agents/${id}/credit`, {
      method: 'POST',
      body: { amount, note },
    });
  },
  globalSearch(q: string) {
    return apiRequest<GlobalSearchResult>(`/admin/search?q=${encodeURIComponent(q)}`);
  },
  getOrderDetail(id: string, gatewayTransaction?: string) {
    const params = new URLSearchParams();
    if (gatewayTransaction) params.set('gatewayTransaction', gatewayTransaction);
    const q = params.toString() ? `?${params}` : '';
    return apiRequest<AdminOrderDetail>(`/admin/orders/${id}/detail${q}`);
  },
  listCustomers(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<AdminCustomer[]>(`/admin/customers?${q}`);
  },
  getCustomer(id: string, params?: { orderSkip?: number; orderTake?: number }) {
    const q = new URLSearchParams();
    if (params?.orderSkip) q.set('orderSkip', String(params.orderSkip));
    if (params?.orderTake) q.set('orderTake', String(params.orderTake));
    const qs = q.toString();
    return apiRequest<AdminCustomerDetail>(`/admin/customers/${id}${qs ? `?${qs}` : ''}`);
  },
  updateCustomer(id: string, body: Record<string, string | undefined>) {
    return apiRequest<AdminCustomer>(`/admin/customers/${id}`, { method: 'PATCH', body });
  },
  lockCustomer(id: string) {
    return apiRequest<{ id: string; status: string }>(`/admin/customers/${id}/lock`, { method: 'POST' });
  },
  unlockCustomer(id: string) {
    return apiRequest<{ id: string; status: string }>(`/admin/customers/${id}/unlock`, { method: 'POST' });
  },
  resetCustomerPassword(id: string, mode?: 'link' | 'temp') {
    return apiRequest<
      | { mode: 'link'; email: string; resetLink: string; message: string }
      | { mode: 'temp'; email: string; tempPassword: string; message: string }
    >(`/admin/customers/${id}/reset-password`, {
      method: 'POST',
      body: mode ? { mode } : {},
    });
  },
  listStaff() {
    return apiRequest<AdminStaff[]>('/admin/staff');
  },
  createStaff(body: { email: string; password: string; fullName: string; role: string }) {
    return apiRequest<AdminStaff>('/admin/staff', { method: 'POST', body });
  },
  updateStaff(id: string, body: Record<string, string | undefined>) {
    return apiRequest<AdminStaff>(`/admin/staff/${id}`, { method: 'PATCH', body });
  },
  disableStaff(id: string) {
    return apiRequest<{ id: string; status: string }>(`/admin/staff/${id}/disable`, { method: 'POST' });
  },
  enableStaff(id: string) {
    return apiRequest<{ id: string; status: string }>(`/admin/staff/${id}/enable`, { method: 'POST' });
  },
  deleteStaff(id: string) {
    return apiRequest<{ id: string; deleted: boolean }>(`/admin/staff/${id}`, { method: 'DELETE' });
  },
  resetStaffPassword(id: string) {
    return apiRequest<{ message: string }>(`/admin/staff/${id}/reset-password`, { method: 'POST' });
  },
  createAgentInvite(body: { email?: string; expiresInDays?: number }) {
    return apiRequest<{ inviteId: string; inviteUrl: string; expiresAt: string }>(
      '/admin/agent-invites',
      { method: 'POST', body },
    );
  },
  reactivateAgent(id: string) {
    return apiRequest<{ agentId: string; status: string }>(`/admin/agents/${id}/reactivate`, {
      method: 'POST',
    });
  },
  updateAgent(
    id: string,
    body: { companyName?: string; contactEmail?: string; rateLimit?: number },
  ) {
    return apiRequest<AdminAgent>(`/admin/agents/${id}`, { method: 'PATCH', body });
  },
  deleteAgent(id: string) {
    return apiRequest<{ agentId: string; deleted: boolean }>(`/admin/agents/${id}`, {
      method: 'DELETE',
    });
  },
};

export const productAdminApi = {
  listCategories() {
    return apiRequest<Category[]>('/admin/products/categories');
  },
  listProducts() {
    return apiRequest<Product[]>('/admin/products');
  },
  createCategory(body: {
    slug: string;
    name: string;
    homeService: HomeServiceType;
    parentId?: string;
    sortOrder?: number;
    iconUrl?: string;
  }) {
    return apiRequest<Category>('/admin/products/categories', { method: 'POST', body });
  },
  updateCategory(id: string, body: { name?: string; parentId?: string; sortOrder?: number; iconUrl?: string | null }) {
    return apiRequest<Category>(`/admin/products/categories/${id}`, { method: 'PATCH', body });
  },
  disableCategory(id: string) {
    return apiRequest<Category>(`/admin/products/categories/${id}/disable`, { method: 'POST' });
  },
  deleteCategory(id: string) {
    return apiRequest<Category>(`/admin/products/categories/${id}`, { method: 'DELETE' });
  },
  createProduct(body: {
    categoryId: string;
    slug: string;
    name: string;
    description?: string;
    logoUrl?: string;
    bannerUrl?: string;
  }) {
    return apiRequest<Product>('/admin/products', { method: 'POST', body });
  },
  updateProduct(
    id: string,
    body: {
      categoryId?: string;
      name?: string;
      description?: string;
      logoUrl?: string | null;
      bannerUrl?: string | null;
    },
  ) {
    return apiRequest<Product>(`/admin/products/${id}`, { method: 'PATCH', body });
  },
  disableProduct(id: string) {
    return apiRequest<Product>(`/admin/products/${id}/disable`, { method: 'POST' });
  },
  deleteProduct(id: string) {
    return apiRequest<Product>(`/admin/products/${id}`, { method: 'DELETE' });
  },
  createVariant(
    productId: string,
    body: {
      sku: string;
      name: string;
      type: string;
      faceValue: number;
      sellPrice: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return apiRequest<ProductVariant>(`/admin/products/${productId}/variants`, {
      method: 'POST',
      body,
    });
  },
  updateVariant(
    variantId: string,
    body: {
      name?: string;
      type?: string;
      faceValue?: number;
      sellPrice?: number;
      metadata?: Record<string, unknown>;
    },
  ) {
    return apiRequest<ProductVariant>(`/admin/products/variants/${variantId}`, {
      method: 'PATCH',
      body,
    });
  },
  disableVariant(variantId: string) {
    return apiRequest<unknown>(`/admin/products/variants/${variantId}/disable`, {
      method: 'POST',
    });
  },
  deleteVariant(variantId: string) {
    return apiRequest<unknown>(`/admin/products/variants/${variantId}`, { method: 'DELETE' });
  },
  listProviderMappings(variantId: string) {
    return apiRequest<ProviderMapping[]>(
      `/admin/products/variants/${variantId}/provider-mappings`,
    );
  },
  createProviderMapping(
    variantId: string,
    body: {
      providerId: string;
      providerProductCode: string;
      providerCost: number;
      priority?: number;
    },
  ) {
    return apiRequest<ProviderMapping>(
      `/admin/products/variants/${variantId}/provider-mappings`,
      { method: 'POST', body },
    );
  },
  disableProviderMapping(mappingId: string) {
    return apiRequest<unknown>(`/admin/products/provider-mappings/${mappingId}/disable`, {
      method: 'POST',
    });
  },
  enableProviderMapping(mappingId: string) {
    return apiRequest<ProviderMapping>(`/admin/products/provider-mappings/${mappingId}/enable`, {
      method: 'POST',
    });
  },
  updateProviderMapping(
    mappingId: string,
    body: {
      providerProductCode?: string;
      providerCost?: number;
      priority?: number;
      status?: string;
    },
  ) {
    return apiRequest<ProviderMapping>(`/admin/products/provider-mappings/${mappingId}`, {
      method: 'PATCH',
      body,
    });
  },
  listProductsFiltered(statusFilter: 'active' | 'inactive' | 'all' = 'all') {
    return apiRequest<Product[]>(`/admin/products?statusFilter=${statusFilter}`);
  },
  restoreProduct(id: string) {
    return apiRequest<Product>(`/admin/products/${id}/restore`, { method: 'POST' });
  },
  restoreCategory(id: string) {
    return apiRequest<Category>(`/admin/products/categories/${id}/restore`, { method: 'POST' });
  },
  restoreVariant(variantId: string) {
    return apiRequest<unknown>(`/admin/products/variants/${variantId}/restore`, {
      method: 'POST',
    });
  },
};

export const cmsAdminApi = {
  listPages(params: { type?: string; status?: string } = {}) {
    const q = new URLSearchParams();
    if (params.type) q.set('type', params.type);
    if (params.status) q.set('status', params.status);
    return apiRequest<CmsPage[]>(`/admin/cms/pages?${q}`);
  },
  getPage(id: string) {
    return apiRequest<CmsPage>(`/admin/cms/pages/${id}`);
  },
  createPage(body: Record<string, unknown>) {
    return apiRequest<CmsPage>('/admin/cms/pages', { method: 'POST', body });
  },
  updatePage(id: string, body: Record<string, unknown>) {
    return apiRequest<CmsPage>(`/admin/cms/pages/${id}`, { method: 'PATCH', body });
  },
  publishPage(id: string) {
    return apiRequest<CmsPage>(`/admin/cms/pages/${id}/publish`, { method: 'POST' });
  },
  listBanners() {
    return apiRequest<CmsBanner[]>('/admin/cms/banners');
  },
  createBanner(body: Record<string, unknown>) {
    return apiRequest<CmsBanner>('/admin/cms/banners', { method: 'POST', body });
  },
  updateBanner(id: string, body: Record<string, unknown>) {
    return apiRequest<CmsBanner>(`/admin/cms/banners/${id}`, { method: 'PATCH', body });
  },
  disableBanner(id: string) {
    return apiRequest<CmsBanner>(`/admin/cms/banners/${id}/disable`, { method: 'POST' });
  },
  deleteBanner(id: string) {
    return apiRequest<void>(`/admin/cms/banners/${id}`, { method: 'DELETE' });
  },
  getSeoSettings() {
    return apiRequest<CmsSeoSettings>('/admin/cms/seo-settings');
  },
  updateSeoSettings(body: Partial<CmsSeoSettings>) {
    return apiRequest<CmsSeoSettings>('/admin/cms/seo-settings', { method: 'PUT', body });
  },
  getThemeSettings() {
    return apiRequest<CmsThemeSettings>('/admin/cms/theme');
  },
  updateThemeSettings(body: Partial<CmsThemeSettings>) {
    return apiRequest<CmsThemeSettings>('/admin/cms/theme', { method: 'PUT', body });
  },
  listCategories() {
    return apiRequest<CmsCategory[]>('/admin/cms/categories');
  },
  createCategory(body: Partial<CmsCategory>) {
    return apiRequest<CmsCategory>('/admin/cms/categories', { method: 'POST', body });
  },
  updateCategory(id: string, body: Partial<CmsCategory>) {
    return apiRequest<CmsCategory>(`/admin/cms/categories/${id}`, { method: 'PATCH', body });
  },
  deleteCategory(id: string) {
    return apiRequest<void>(`/admin/cms/categories/${id}`, { method: 'DELETE' });
  },
  listTags() {
    return apiRequest<CmsTag[]>('/admin/cms/tags');
  },
  createTag(body: Partial<CmsTag>) {
    return apiRequest<CmsTag>('/admin/cms/tags', { method: 'POST', body });
  },
  updateTag(id: string, body: Partial<CmsTag>) {
    return apiRequest<CmsTag>(`/admin/cms/tags/${id}`, { method: 'PATCH', body });
  },
  deleteTag(id: string) {
    return apiRequest<void>(`/admin/cms/tags/${id}`, { method: 'DELETE' });
  },
  toggleTagVisibility(id: string, isHidden: boolean) {
    return apiRequest<CmsTag>(`/admin/cms/tags/${id}/visibility`, {
      method: 'PATCH',
      body: { isHidden },
    });
  },
  listMedia(params?: { folder?: string; search?: string; mimeType?: string }) {
    const q = new URLSearchParams();
    if (params?.folder) q.set('folder', params.folder);
    if (params?.search) q.set('search', params.search);
    if (params?.mimeType) q.set('mimeType', params.mimeType);
    const qs = q.toString();
    return apiRequest<CmsMedia[]>(`/admin/cms/media${qs ? `?${qs}` : ''}`);
  },
  async uploadMedia(file: File, meta?: { alt?: string; title?: string; folder?: string }) {
    const form = new FormData();
    form.append('file', file);
    if (meta?.alt) form.append('alt', meta.alt);
    if (meta?.title) form.append('title', meta.title);
    if (meta?.folder) form.append('folder', meta.folder);
    const headers: Record<string, string> = {};
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${getApiBaseUrl()}/admin/cms/media/upload`, {
      method: 'POST',
      headers,
      body: form,
      cache: 'no-store',
    });
    return parseResponse<CmsMedia>(response);
  },
  deleteMedia(id: string) {
    return apiRequest<void>(`/admin/cms/media/${id}`, { method: 'DELETE' });
  },
};

export const contactAdminApi = {
  list(status?: 'NEW' | 'PROCESSED') {
    const q = status ? `?status=${status}` : '';
    return apiRequest<ContactMessage[]>(`/admin/contact-messages${q}`);
  },
  get(id: string) {
    return apiRequest<ContactMessage>(`/admin/contact-messages/${id}`);
  },
  markProcessed(id: string) {
    return apiRequest<ContactMessage>(`/admin/contact-messages/${id}/processed`, { method: 'PATCH' });
  },
  remove(id: string) {
    return apiRequest<{ deleted: boolean }>(`/admin/contact-messages/${id}`, { method: 'DELETE' });
  },
};

export const supportAdminApi = {
  list(params?: { status?: string; priority?: string; ticketCode?: string }) {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.priority) q.set('priority', params.priority);
    if (params?.ticketCode) q.set('ticketCode', params.ticketCode);
    const qs = q.toString();
    return apiRequest<SupportTicket[]>(`/admin/support/tickets${qs ? `?${qs}` : ''}`);
  },
  get(id: string) {
    return apiRequest<SupportTicket>(`/admin/support/tickets/${id}`);
  },
  reply(id: string, body: string) {
    return apiRequest<SupportTicket>(`/admin/support/tickets/${id}/reply`, {
      method: 'POST',
      body: { body },
    });
  },
  close(id: string) {
    return apiRequest<SupportTicket>(`/admin/support/tickets/${id}/close`, { method: 'PATCH' });
  },
};

export const faqAdminApi = {
  listCategories() {
    return apiRequest<FaqCategory[]>('/admin/faq/categories');
  },
  createCategory(body: Partial<FaqCategory> & { name: string }) {
    return apiRequest<FaqCategory>('/admin/faq/categories', { method: 'POST', body });
  },
  updateCategory(id: string, body: Partial<FaqCategory>) {
    return apiRequest<FaqCategory>(`/admin/faq/categories/${id}`, { method: 'PATCH', body });
  },
  deleteCategory(id: string) {
    return apiRequest<{ deleted: boolean }>(`/admin/faq/categories/${id}`, { method: 'DELETE' });
  },
  list(params: {
    q?: string;
    categoryId?: string;
    position?: string;
    status?: string;
    featured?: boolean;
    page?: number;
    limit?: number;
  } = {}) {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.categoryId) sp.set('categoryId', params.categoryId);
    if (params.position) sp.set('position', params.position);
    if (params.status) sp.set('status', params.status);
    if (params.featured) sp.set('featured', 'true');
    if (params.page) sp.set('page', String(params.page));
    if (params.limit) sp.set('limit', String(params.limit));
    const qs = sp.toString();
    return apiRequest<FaqListResponse>(`/admin/faqs${qs ? `?${qs}` : ''}`);
  },
  get(id: string) {
    return apiRequest<FaqItem>(`/admin/faqs/${id}`);
  },
  create(body: {
    categoryId: string;
    question: string;
    answer: string;
    slug?: string;
    featured?: boolean;
    sortOrder?: number;
    status?: string;
    positions?: string[];
  }) {
    return apiRequest<FaqItem>('/admin/faqs', { method: 'POST', body });
  },
  update(
    id: string,
    body: Partial<{
      categoryId: string;
      question: string;
      answer: string;
      slug: string;
      featured: boolean;
      sortOrder: number;
      status: string;
      positions: string[];
    }>,
  ) {
    return apiRequest<FaqItem>(`/admin/faqs/${id}`, { method: 'PATCH', body });
  },
  delete(id: string) {
    return apiRequest<{ deleted: boolean }>(`/admin/faqs/${id}`, { method: 'DELETE' });
  },
  bulkUpdate(body: {
    ids: string[];
    patch: { status?: string; featured?: boolean; positions?: string[] };
  }) {
    return apiRequest<{ updated: number }>('/admin/faqs/bulk', { method: 'PATCH', body });
  },
  migrateLegacy() {
    return apiRequest<{ migrated: number; skipped: number; featured: number; total?: number }>(
      '/admin/faqs/migrate-legacy',
      { method: 'POST' },
    );
  },
};

export const emailTemplateAdminApi = {
  list() {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        subject: string;
        htmlBody: string;
        textBody: string | null;
        variables: string[];
        isActive: boolean;
      }>
    >('/admin/cms/email-templates');
  },
  save(
    templates: Array<{
      code: string;
      name: string;
      subject: string;
      htmlBody: string;
      textBody?: string | null;
      variables?: string[];
      isActive?: boolean;
    }>,
  ) {
    return apiRequest<
      Array<{
        id: string;
        code: string;
        name: string;
        subject: string;
        htmlBody: string;
        textBody: string | null;
        variables: string[];
        isActive: boolean;
      }>
    >('/admin/cms/email-templates', { method: 'PUT', body: { templates } });
  },
};

export const settingsAdminApi = {
  getMegapay() {
    return apiRequest<PaymentGatewaySettings>('/admin/settings/payment/megapay');
  },
  updateMegapay(body: Partial<PaymentGatewaySettings>) {
    return apiRequest<PaymentGatewaySettings>('/admin/settings/payment/megapay', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  getSepay() {
    return apiRequest<PaymentGatewaySettings>('/admin/settings/payment/sepay');
  },
  updateSepay(body: Partial<PaymentGatewaySettings>) {
    return apiRequest<PaymentGatewaySettings>('/admin/settings/payment/sepay', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  getPaymentRuntime() {
    return apiRequest<import('@/types/api').PaymentRuntimeSettings>('/admin/settings/payment/runtime');
  },
  updatePaymentRuntime(body: Partial<import('@/types/api').PaymentRuntimeSettings>) {
    return apiRequest<import('@/types/api').PaymentRuntimeSettings>('/admin/settings/payment/runtime', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  getPaymentStrategy() {
    return apiRequest<import('@/types/api').PaymentStrategySettings>('/admin/settings/payment/strategy');
  },
  updatePaymentStrategy(body: import('@/types/api').UpdatePaymentStrategyBody) {
    return apiRequest<import('@/types/api').PaymentStrategySettings>('/admin/settings/payment/strategy', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  updatePaymentGatewayRuntime(
    code: 'MEGAPAY' | 'SEPAY',
    body: Partial<import('@/types/api').PaymentGatewayRuntimeSettings>,
  ) {
    return apiRequest<import('@/types/api').PaymentGatewayRuntimeSettings>(
      `/admin/settings/payment/gateways/${code}/runtime`,
      {
        method: 'PUT',
        body: stripSettingsReadonly(body as Record<string, unknown>),
      },
    );
  },
  reloadPayment() {
    return apiRequest<{ reloaded: boolean }>('/admin/settings/payment/reload', {
      method: 'POST',
    });
  },
  getPaymentMethods() {
    return apiRequest<{ methods: PaymentMethodConfig[] }>('/admin/settings/payment/methods');
  },
  updatePaymentMethods(body: { methods: PaymentMethodConfig[] }) {
    return apiRequest<{ methods: PaymentMethodConfig[] }>('/admin/settings/payment/methods', {
      method: 'PUT',
      body,
    });
  },
  getEsale() {
    return apiRequest<ProviderEsaleSettings>('/admin/settings/provider/esale');
  },
  updateEsale(body: Partial<ProviderEsaleSettings>) {
    return apiRequest<ProviderEsaleSettings>('/admin/settings/provider/esale', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  testEsaleConnection() {
    return apiRequest<{ ok: boolean; message: string }>(
      '/admin/settings/provider/esale/test-connection',
      { method: 'POST' },
    );
  },
  checkEsaleBalance() {
    return apiRequest<{ balance: string; lastCheckedAt: string; lowBalance: boolean }>(
      '/admin/settings/provider/esale/check-balance',
      { method: 'POST' },
    );
  },
  syncEsaleProducts() {
    return apiRequest<{ synced: number; message?: string }>(
      '/admin/settings/provider/esale/sync-products',
      { method: 'POST' },
    );
  },
  getSmtp() {
    return apiRequest<SmtpSettings>('/admin/settings/smtp');
  },
  updateSmtp(body: Partial<SmtpSettings>) {
    return apiRequest<SmtpSettings>('/admin/settings/smtp', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  testSmtp(to: string) {
    return apiRequest<{ ok: boolean; messageId?: string }>('/admin/settings/smtp/test', {
      method: 'POST',
      body: { to },
    });
  },
  getSystem() {
    return apiRequest<SystemSettings>('/admin/settings/system');
  },
  updateSystem(body: Partial<SystemSettings>) {
    return apiRequest<SystemSettings>('/admin/settings/system', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  getOrder() {
    return apiRequest<OrderSettings>('/admin/settings/order');
  },
  updateOrder(body: Partial<OrderSettings>) {
    return apiRequest<OrderSettings>('/admin/settings/order', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  getTelegram() {
    return apiRequest<TelegramSettings>('/admin/settings/telegram');
  },
  updateTelegram(body: Partial<TelegramSettings>) {
    return apiRequest<TelegramSettings>('/admin/settings/telegram', {
      method: 'PUT',
      body: stripSettingsReadonly(body as Record<string, unknown>),
    });
  },
  reloadAll() {
    return apiRequest<{ reloaded: boolean }>('/admin/settings/reload', { method: 'POST' });
  },
};

export const configurationCenterApi = {
  overview() {
    return apiRequest<ConfigurationOverview>('/admin/configuration/overview');
  },
  search(q: string) {
    return apiRequest<{ items: ConfigurationSearchEntry[] }>(
      `/admin/configuration/search?q=${encodeURIComponent(q)}`,
    );
  },
  auditMeta(module: string) {
    return apiRequest<ConfigurationAuditMeta>(`/admin/configuration/modules/${module}/audit-meta`);
  },
  exportModule(module: string, includeSecrets = false) {
    return apiRequest<Record<string, unknown>>(
      `/admin/configuration/export/${module}?include_secrets=${includeSecrets ? 'true' : 'false'}`,
    );
  },
  importModule(module: string, body: { data: Record<string, unknown>; include_secrets?: boolean }) {
    return apiRequest<{ ok: boolean }>(`/admin/configuration/import/${module}`, {
      method: 'POST',
      body,
    });
  },
  testMegapay() {
    return apiRequest<{ ok: boolean; message?: string; latencyMs?: number }>(
      '/admin/configuration/test/megapay',
      { method: 'POST' },
    );
  },
  testSepay() {
    return apiRequest<{ ok: boolean; message?: string }>('/admin/configuration/test/sepay', {
      method: 'POST',
    });
  },
  testTelegram(body: { message?: string } = {}) {
    return apiRequest<{ ok: boolean; message?: string; latencyMs?: number }>(
      '/admin/configuration/test/telegram',
      { method: 'POST', body },
    );
  },
  testWebhook() {
    return apiRequest<{ ok: boolean; message?: string; httpStatus?: number }>(
      '/admin/configuration/test/webhook',
      { method: 'POST' },
    );
  },
  testProvider() {
    return apiRequest<{ ok: boolean; message: string }>('/admin/configuration/test/provider', {
      method: 'POST',
    });
  },
};

export const maintenanceCenterApi = {
  getDashboard() {
    return apiRequest<import('@/types/api').MaintenanceDashboard>('/admin/maintenance');
  },
  update(body: Record<string, unknown>) {
    return apiRequest<import('@/types/api').MaintenanceDashboard>('/admin/maintenance', {
      method: 'PUT',
      body,
    });
  },
  preview(body: Record<string, unknown>) {
    return apiRequest<{ mode: string; banner: Record<string, unknown>; preview: Record<string, unknown> }>(
      '/admin/maintenance/preview',
      { method: 'POST', body },
    );
  },
  applySchedule(body: Record<string, unknown>) {
    return apiRequest<import('@/types/api').MaintenanceDashboard>('/admin/maintenance/schedule', {
      method: 'POST',
      body,
    });
  },
};

export const systemHealthApi = {
  getHealth() {
    return apiRequest<SystemHealthSummary>('/admin/system/health');
  },
  getStatus() {
    return apiRequest<import('@/types/api').HealthScanState>('/admin/system/health/status');
  },
  getReport() {
    return apiRequest<IntegrityReport>('/admin/system/health/report');
  },
  runScan() {
    return apiRequest<{ status: 'started' | 'running'; startedAt: string | null }>(
      '/admin/system/health/run',
      { method: 'POST' },
    );
  },
  autoFix() {
    return apiRequest<AutoFixResponse>('/admin/system/health/autofix', { method: 'POST' });
  },
  exportJsonUrl() {
    return `${getApiBaseUrl()}/admin/system/health/export/json`;
  },
  exportPdfUrl() {
    return `${getApiBaseUrl()}/admin/system/health/export/pdf`;
  },
};

export const financeApi = {
  getProfit(dateFrom: string, dateTo: string) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    return apiRequest<ProfitReport>(`/admin/finance/profit?${q}`);
  },
  getGatewayFees(dateFrom: string, dateTo: string, gateway?: string) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    if (gateway) q.set('gateway', gateway);
    return apiRequest<GatewayFeesReport>(`/admin/finance/gateway-fees?${q}`);
  },
  getPaymentSettlement(
    dateFrom: string,
    dateTo: string,
    gateway?: string,
    settlementType?: string,
  ) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    if (gateway) q.set('gateway', gateway);
    if (settlementType) q.set('settlementType', settlementType);
    return apiRequest<import('@/types/api').PaymentSettlementReport>(
      `/admin/finance/payment-settlement?${q}`,
    );
  },
  listGatewayInvoices(skip = 0, take = 50) {
    return apiRequest<import('@/types/api').GatewayInvoiceRecord[]>(
      `/admin/finance/gateway-invoices?skip=${skip}&take=${take}`,
    );
  },
  upsertGatewayInvoice(body: {
    gatewayCode: string;
    period: string;
    periodStart: string;
    periodEnd: string;
    totalTransactions: number;
    totalVolume: string;
    totalFee: string;
    vatAmount?: string;
    invoiceNumber?: string;
    notes?: string;
  }) {
    return apiRequest<import('@/types/api').GatewayInvoiceRecord & {
      comparison: { transactionDelta: number; volumeDelta: string; feeDelta: string };
    }>('/admin/finance/gateway-invoices', { method: 'POST', body });
  },
  listReconcileReports(skip = 0, take = 20) {
    return apiRequest<ReconcileReport[]>(
      `/admin/finance/reconcile/reports?skip=${skip}&take=${take}`,
    );
  },
  getReconcileReport(id: string) {
    return apiRequest<ReconcileReport>(`/admin/finance/reconcile/reports/${id}`);
  },
  listInvoices(skip = 0, take = 20) {
    return apiRequest<Invoice[]>(`/admin/finance/invoices?skip=${skip}&take=${take}`);
  },
  getAgentStatement(agentId: string, dateFrom: string, dateTo: string) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    return apiRequest<AgentStatement>(`/admin/finance/agents/${agentId}/statement?${q}`);
  },
  async exportProfitCsv(dateFrom: string, dateTo: string) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const csv = await apiRequest<string>(`/admin/finance/export/profit?${q}`);
    downloadBlob(csv, `profit-${dateFrom}-${dateTo}.csv`);
  },
  async exportPaymentsReconciliationCsv(
    dateFrom: string,
    dateTo: string,
    gateway?: string,
  ) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    if (gateway) q.set('gateway', gateway);
    const csv = await apiRequest<string>(`/admin/finance/export/payments-reconciliation?${q}`);
    downloadBlob(csv, `payments-reconciliation-${dateFrom}-${dateTo}.csv`);
  },
  async exportReconciliationCsv(reportId: string) {
    const csv = await apiRequest<string>(`/admin/finance/export/reconciliation/${reportId}`);
    downloadBlob(csv, `reconciliation-${reportId}.csv`);
  },
  async exportAgentStatementCsv(agentId: string, dateFrom: string, dateTo: string) {
    const q = new URLSearchParams({ dateFrom, dateTo });
    const csv = await apiRequest<string>(
      `/admin/finance/export/agents/${agentId}/statement?${q}`,
    );
    downloadBlob(csv, `agent-statement-${agentId}.csv`);
  },
  getProviderFinanceDashboard(dateFrom?: string, dateTo?: string, providerId?: string) {
    const q = new URLSearchParams();
    if (dateFrom) q.set('dateFrom', dateFrom);
    if (dateTo) q.set('dateTo', dateTo);
    if (providerId) q.set('providerId', providerId);
    return apiRequest<import('@/types/api').ProviderFinanceDashboard>(
      `/admin/finance/providers/dashboard?${q}`,
    );
  },
  listProviderReconciliation(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<import('@/types/api').ProviderReconciliationReport[]>(
      `/admin/finance/providers/reconciliation?${q}`,
    );
  },
  runProviderReconciliation(providerId?: string, reportDate?: string) {
    return apiRequest<unknown>('/admin/finance/providers/reconciliation/run', {
      method: 'POST',
      body: { providerId, reportDate },
    });
  },
  searchProviderTransactions(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '') q.set(k, String(v));
    });
    return apiRequest<{
      items: import('@/types/api').ProviderTransactionSearchItem[];
      total: number;
    }>(`/admin/finance/providers/transactions?${q}`);
  },
  async exportProviderTransactionsCsv(params: Record<string, string | undefined> = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const csv = await apiRequest<string>(`/admin/finance/export/providers/transactions?${q}`);
    downloadBlob(csv, `provider-transactions-${Date.now()}.csv`);
  },
};

function buildAuditQuery(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return q.toString();
}

async function downloadAuditExport(path: string, filename: string, mime: string) {
  const token = getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new ApiClientError('Export failed', response.status);
  }
  const buffer = await response.arrayBuffer();
  downloadArrayBuffer(buffer, filename, mime);
}

export const systemAuditApi = {
  list(params: Record<string, string | number | undefined> = {}) {
    const q = buildAuditQuery(params);
    return apiRequest<SystemAuditLogListResponse>(`/admin/audit?${q}`);
  },
  get(id: string) {
    return apiRequest<SystemAuditLog>(`/admin/audit/${id}`);
  },
  async exportCsv(params: Record<string, string | undefined> = {}) {
    const q = buildAuditQuery(params);
    const csv = await apiRequest<string>(`/admin/audit/export/csv?${q}`);
    downloadBlob(csv, `system-audit-${Date.now()}.csv`);
  },
  async exportExcel(params: Record<string, string | undefined> = {}) {
    const q = buildAuditQuery(params);
    await downloadAuditExport(
      `/admin/audit/export/excel?${q}`,
      `system-audit-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  },
};

function buildActivityQuery(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return q.toString();
}

export const systemActivityApi = {
  list(params: Record<string, string | number | undefined> = {}) {
    const q = buildActivityQuery(params);
    return apiRequest<SystemActivityLogListResponse>(`/admin/activity?${q}`);
  },
  get(id: string) {
    return apiRequest<SystemActivityLog>(`/admin/activity/${id}`);
  },
  async exportCsv(params: Record<string, string | undefined> = {}) {
    const q = buildActivityQuery(params);
    const csv = await apiRequest<string>(`/admin/activity/export/csv?${q}`);
    downloadBlob(csv, `system-activity-${Date.now()}.csv`);
  },
  async exportExcel(params: Record<string, string | undefined> = {}) {
    const q = buildActivityQuery(params);
    await downloadAuditExport(
      `/admin/activity/export/excel?${q}`,
      `system-activity-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  },
};

function buildNotificationQuery(params: Record<string, string | number | boolean | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return q.toString();
}

export const systemNotificationApi = {
  list(params: Record<string, string | number | boolean | undefined> = {}) {
    const q = buildNotificationQuery(params);
    return apiRequest<SystemNotificationListResponse>(`/admin/notifications?${q}`);
  },
  get(id: string) {
    return apiRequest<SystemNotification>(`/admin/notifications/${id}`);
  },
  unreadCount() {
    return apiRequest<{ count: number }>('/admin/notifications/unread-count');
  },
  markRead(id: string) {
    return apiRequest<{ count: number }>(`/admin/notifications/${id}/read`, { method: 'PATCH' });
  },
  markAllRead() {
    return apiRequest<{ count: number }>('/admin/notifications/read-all', { method: 'PATCH' });
  },
  dismiss(ids: string[]) {
    return apiRequest<{ count: number }>('/admin/notifications/dismiss', {
      method: 'PATCH',
      body: { ids },
    });
  },
  async exportCsv(params: Record<string, string | boolean | undefined> = {}) {
    const q = buildNotificationQuery(params);
    const csv = await apiRequest<string>(`/admin/notifications/export/csv?${q}`);
    downloadBlob(csv, `notifications-${Date.now()}.csv`);
  },
  async exportExcel(params: Record<string, string | boolean | undefined> = {}) {
    const q = buildNotificationQuery(params);
    await downloadAuditExport(
      `/admin/notifications/export/excel?${q}`,
      `notifications-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  },
};

function buildQueueQuery(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return q.toString();
}

export const queueMonitorApi = {
  list() {
    return apiRequest<QueueMonitorDashboard>('/admin/queues');
  },
  getQueue(queue: string) {
    return apiRequest<QueueMonitorQueueRow & { isPaused?: boolean; config?: QueueMonitorConfig }>(
      `/admin/queues/${queue}`,
    );
  },
  listJobs(queue: string, params: Record<string, string | number | undefined> = {}) {
    const q = buildQueueQuery(params);
    return apiRequest<{ items: QueueMonitorJob[]; total: number; page: number; limit: number; status: string }>(
      `/admin/queues/${queue}/jobs?${q}`,
    );
  },
  statistics(queue: string) {
    return apiRequest<QueueMonitorStatistics>(`/admin/queues/${queue}/statistics`);
  },
  history(queue: string, params: Record<string, string | undefined> = {}) {
    const q = buildQueueQuery(params);
    return apiRequest<QueueMonitorHistory>(`/admin/queues/${queue}/history?${q}`);
  },
  workers(queue: string) {
    return apiRequest<QueueMonitorWorkerInfo>(`/admin/queues/${queue}/workers`);
  },
  config(queue: string) {
    return apiRequest<QueueMonitorConfig>(`/admin/queues/${queue}/config`);
  },
  getJob(queue: string, id: string) {
    return apiRequest<QueueMonitorJobDetail>(`/admin/jobs/${id}?queue=${encodeURIComponent(queue)}`);
  },
  pause(queue: string) {
    return apiRequest<{ ok: boolean }>(`/admin/queues/${queue}/pause`, { method: 'POST' });
  },
  resume(queue: string) {
    return apiRequest<{ ok: boolean }>(`/admin/queues/${queue}/resume`, { method: 'POST' });
  },
  clean(queue: string, body: { status?: string; grace_ms?: number; limit?: number } = {}) {
    return apiRequest<{ ok: boolean; removed: number }>(`/admin/queues/${queue}/clean`, {
      method: 'POST',
      body,
    });
  },
  retryFailed(queue: string) {
    return apiRequest<{ ok: boolean; retried: number }>(`/admin/queues/${queue}/retry-failed`, {
      method: 'POST',
    });
  },
  removeAllCompleted(queue: string) {
    return apiRequest<{ ok: boolean; removed: number }>(`/admin/queues/${queue}/remove-completed`, {
      method: 'POST',
    });
  },
  bulkJobs(queue: string, body: { action: 'retry' | 'remove' | 'promote'; job_ids: string[] }) {
    return apiRequest<{ ok: boolean; processed: number; failed: number }>(
      `/admin/queues/${queue}/jobs/bulk`,
      { method: 'POST', body },
    );
  },
  retryJob(queue: string, id: string) {
    return apiRequest<{ ok: boolean }>(`/admin/jobs/${id}/retry?queue=${encodeURIComponent(queue)}`, {
      method: 'POST',
    });
  },
  promoteJob(queue: string, id: string) {
    return apiRequest<{ ok: boolean }>(`/admin/jobs/${id}/promote?queue=${encodeURIComponent(queue)}`, {
      method: 'POST',
    });
  },
  removeJob(queue: string, id: string) {
    return apiRequest<{ ok: boolean }>(`/admin/jobs/${id}?queue=${encodeURIComponent(queue)}`, {
      method: 'DELETE',
    });
  },
  async exportCsv(queue: string, params: Record<string, string | undefined> = {}) {
    const q = buildQueueQuery(params);
    const csv = await apiRequest<string>(`/admin/queues/${queue}/export/csv?${q}`);
    downloadBlob(csv, `queue-${queue}-${Date.now()}.csv`);
  },
  async exportExcel(queue: string, params: Record<string, string | undefined> = {}) {
    const q = buildQueueQuery(params);
    await downloadAuditExport(
      `/admin/queues/${queue}/export/excel?${q}`,
      `queue-${queue}-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  },
  async exportJson(queue: string, params: Record<string, string | undefined> = {}) {
    const q = buildQueueQuery(params);
    const json = await apiRequest<string>(`/admin/queues/${queue}/export/json?${q}`);
    downloadBlob(json, `queue-${queue}-${Date.now()}.json`, 'application/json');
  },
};

function buildWebhookQuery(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  return q.toString();
}

export const webhookMonitorApi = {
  list(params: Record<string, string | number | undefined> = {}) {
    const q = buildWebhookQuery(params);
    return apiRequest<WebhookMonitorListResponse>(`/admin/webhooks?${q}`);
  },
  getById(id: string) {
    return apiRequest<WebhookMonitorDetail>(`/admin/webhooks/${id}`);
  },
  statistics(source?: string) {
    const q = source ? `?source=${encodeURIComponent(source)}` : '';
    return apiRequest<WebhookMonitorStatistics>(`/admin/webhooks/statistics${q}`);
  },
  history(params: Record<string, string | undefined> = {}) {
    const q = buildWebhookQuery(params);
    return apiRequest<WebhookMonitorHistory>(`/admin/webhooks/history?${q}`);
  },
  retry(id: string) {
    return apiRequest<{ ok: boolean }>(`/admin/webhooks/${id}/retry`, { method: 'POST' });
  },
  retryFailed(ids?: string[]) {
    return apiRequest<{ ok: boolean; retried: number }>(`/admin/webhooks/retry-failed`, {
      method: 'POST',
      body: ids?.length ? { ids } : {},
    });
  },
  cancel(ids: string[]) {
    return apiRequest<{ ok: boolean; cancelled: number }>(`/admin/webhooks/cancel`, {
      method: 'POST',
      body: { ids },
    });
  },
  logCopy(id: string, action: string) {
    return apiRequest<{ ok: boolean }>(`/admin/webhooks/${id}/log-copy`, {
      method: 'POST',
      body: { action },
    });
  },
  async exportCsv(params: Record<string, string | undefined> = {}) {
    const q = buildWebhookQuery(params);
    const csv = await apiRequest<string>(`/admin/webhooks/export/csv?${q}`);
    downloadBlob(csv, `webhooks-${Date.now()}.csv`);
  },
  async exportExcel(params: Record<string, string | undefined> = {}) {
    const q = buildWebhookQuery(params);
    await downloadAuditExport(
      `/admin/webhooks/export/excel?${q}`,
      `webhooks-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  },
  async exportJson(params: Record<string, string | undefined> = {}) {
    const q = buildWebhookQuery(params);
    const json = await apiRequest<string>(`/admin/webhooks/export/json?${q}`);
    downloadBlob(json, `webhooks-${Date.now()}.json`, 'application/json');
  },
};

export interface PartnerApiLogEntry {
  id: string;
  at: string;
  type: string;
  ip: string | null;
  path: string;
  method: string;
  message: string;
  requestId: string | null;
  apiKeyMasked: string | null;
  httpStatus: number;
  latencyMs: number | null;
  gateway: string | null;
  provider: string | null;
  orderId: string | null;
  partnerOrderId: string | null;
  errorCode: string | null;
  correlationId: string | null;
}

export interface PartnerApiLogDetail extends PartnerApiLogEntry {
  requestHeaders: Record<string, unknown>;
  requestBody: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, unknown>;
}

export interface PartnerApiLogListResponse {
  items: PartnerApiLogEntry[];
  page: number;
  limit: number;
  total: number;
}

export const partnerApiLogsApi = {
  list(params: Record<string, string | number | undefined> = {}) {
    const q = buildWebhookQuery(params);
    return apiRequest<PartnerApiLogListResponse>(`/admin/partner-api-logs?${q}`);
  },
  getById(id: string) {
    return apiRequest<PartnerApiLogDetail>(`/admin/partner-api-logs/${id}`);
  },
};

export const operationsApi = {
  getDashboard() {
    return apiRequest<OperationsDashboard>('/admin/operations/dashboard');
  },
  getReconciliationSummary() {
    return apiRequest<OperationsReconciliationSummary>('/admin/operations/reconciliation/summary');
  },
  listReconciliation(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    return apiRequest<OperationsReconciliationList>(`/admin/operations/reconciliation?${q}`);
  },
  listExceptions(params: Record<string, string | number | undefined> = {}) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    return apiRequest<OperationsExceptionList>(`/admin/operations/exceptions?${q}`);
  },
  updateException(id: string, body: { status?: string; note?: string; assignedTo?: string }) {
    return apiRequest<OperationsExceptionItem>(`/admin/operations/exceptions/${id}`, {
      method: 'PATCH',
      body,
    });
  },
  search(q: string) {
    return apiRequest<OperationsSearchResult>(`/admin/operations/search?q=${encodeURIComponent(q)}`);
  },
  listInvoices(skip = 0, take = 25) {
    return apiRequest<Invoice[]>(`/admin/operations/invoices?skip=${skip}&take=${take}`);
  },
  getInvoice(id: string) {
    return apiRequest<Invoice>(`/admin/operations/invoices/${id}`);
  },
  manualAction(
    action: string,
    body: { orderId?: string; webhookId?: string; note?: string },
  ) {
    return apiRequest<{ ok: boolean; action: string; message?: string }>(
      `/admin/operations/manual/${action}`,
      { method: 'POST', body },
    );
  },
};

export interface OperationsDashboard {
  cards: {
    transactionsToday: number;
    exceptions: number;
    needManualReview: number;
    webhookPending: number;
    providerTimeout: number;
    mismatch: number;
    invoicesPending: number;
    avgResolutionMs: number;
  };
  asOf: string;
}

export interface OperationsReconciliationSummary {
  total: number;
  reconciled: number;
  unreconciled: number;
  mismatch: number;
  pending: number;
}

export interface OperationsMismatchItem {
  id: string;
  type: string;
  severity: string;
  orderId: string | null;
  orderCode: string | null;
  paymentReference: string | null;
  providerRef: string | null;
  description: string;
  detectedAt: string;
  gateway: string | null;
  provider: string | null;
}

export interface OperationsReconciliationList {
  summary: OperationsReconciliationSummary;
  items: OperationsMismatchItem[];
  total: number;
  skip: number;
  take: number;
}

export interface OperationsExceptionItem extends OperationsMismatchItem {
  status: string;
  assignedTo: string | null;
  assignedEmail: string | null;
  notes: Array<{ at: string; by: string; text: string }>;
  updatedAt: string;
}

export interface OperationsExceptionList {
  items: OperationsExceptionItem[];
  total: number;
  skip: number;
  take: number;
}

export interface OperationsSearchResult {
  orders: Array<{ id: string; label: string; status: string; paymentStatus: string; createdAt: string }>;
  payments: Array<{ id: string; label: string; status: string; gateway: string; createdAt: string }>;
  invoices: Array<{ id: string; label: string; status: string; amount: string; createdAt: string }>;
  agents: Array<{ id: string; label: string; status: string }>;
}

export interface AgentCenterListItem {
  id: string;
  agentCode: string;
  companyName: string;
  businessType: string;
  status: string;
  kycStatus: string | null;
  walletBalance: string;
  heldBalance: string;
  todayOrders: number;
  apiStatus: string;
  webhookStatus: string;
  memberCount: number;
  createdAt: string;
  lastActivityAt: string | null;
  contactEmail: string | null;
  userEmail: string | null;
  taxCode: string | null;
  tags: string[];
}

export interface AgentCenterListResponse {
  items: AgentCenterListItem[];
  total: number;
  skip: number;
  take: number;
}

function agentCenterQuery(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const agentCenterApi = {
  dashboard() {
    return apiRequest<{
      total: number;
      active: number;
      pendingKyc: number;
      suspended: number;
      kycQueue: number;
      registeredToday: number;
      apiEnabledCount: number;
      pendingReview: number;
      needMoreInfo: number;
      approvedToday: number;
      rejectedToday: number;
    }>('/admin/agent-center/dashboard');
  },
  listAgents(params: Record<string, string | number | boolean | undefined> = {}) {
    return apiRequest<AgentCenterListResponse>(`/admin/agent-center/agents${agentCenterQuery(params)}`);
  },
  search(q: string, limit = 20) {
    return apiRequest<AgentCenterListItem[]>(
      `/admin/agent-center/agents/search${agentCenterQuery({ q, limit })}`,
    );
  },
  kycQueue(params: Record<string, number | undefined> = {}) {
    return apiRequest<AgentCenterListResponse>(`/admin/agent-center/kyc-queue${agentCenterQuery(params)}`);
  },
  onboardingQueue(params: Record<string, string | number | undefined> = {}) {
    return apiRequest<{
      items: Array<Record<string, unknown>>;
      total: number;
      skip: number;
      take: number;
    }>(`/admin/agent-center/onboarding-queue${agentCenterQuery(params)}`);
  },
  agentOnboarding(agentId: string) {
    return apiRequest<Record<string, unknown>>(`/admin/agent-center/agents/${agentId}/onboarding`);
  },
  kycDocumentPath(agentId: string, storageKey: string) {
    const params = new URLSearchParams({ key: storageKey });
    return `/admin/agent-center/agents/${agentId}/onboarding/kyc-document?${params}`;
  },
  async fetchKycDocumentBlob(agentId: string, storageKey: string): Promise<string> {
    const token = getAccessToken();
    const path = agentCenterApi.kycDocumentPath(agentId, storageKey);
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error('Failed to load KYC document');
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
  allowedTags() {
    return apiRequest<string[]>('/admin/agent-center/tags');
  },
  rolesMatrix() {
    return apiRequest<{ roles: Array<{ role: string; permissions: string[] }> }>(
      '/admin/agent-center/roles/matrix',
    );
  },
  overview(agentId: string) {
    return apiRequest<Record<string, unknown>>(`/admin/agent-center/agents/${agentId}/overview`);
  },
  information(agentId: string) {
    return apiRequest<Record<string, unknown>>(`/admin/agent-center/agents/${agentId}/information`);
  },
  wallet(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet${agentCenterQuery(params)}`,
    );
  },
  api(agentId: string) {
    return apiRequest<Record<string, unknown>>(`/admin/agent-center/agents/${agentId}/api`);
  },
  webhooks(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/webhooks${agentCenterQuery(params)}`,
    );
  },
  members(agentId: string) {
    return apiRequest<{ items: Array<Record<string, unknown>> }>(
      `/admin/agent-center/agents/${agentId}/members`,
    );
  },
  orders(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/orders${agentCenterQuery(params)}`,
    );
  },
  activity(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/activity${agentCenterQuery(params)}`,
    );
  },
  loginHistory(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/login-history${agentCenterQuery(params)}`,
    );
  },
  pricing(agentId: string) {
    return apiRequest<Record<string, unknown>>(`/admin/agent-center/agents/${agentId}/pricing`);
  },
  walletSummary(agentId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/summary`,
    );
  },
  walletLedger(agentId: string, params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/ledger${agentCenterQuery(params)}`,
    );
  },
  walletDeposits(agentId: string, params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/deposits${agentCenterQuery(params)}`,
    );
  },
  walletManualOperations(agentId: string, params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/manual-operations${agentCenterQuery(params)}`,
    );
  },
  walletManualCredit(agentId: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/manual-credit`,
      { method: 'POST', body },
    );
  },
  walletApproveCredit(agentId: string, creditId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/manual-credit/${creditId}/approve`,
      { method: 'POST', body: {} },
    );
  },
  walletRejectCredit(agentId: string, creditId: string, reason: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/manual-credit/${creditId}/reject`,
      { method: 'POST', body: { reason } },
    );
  },
  walletManualDebit(agentId: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/manual-debit`,
      { method: 'POST', body },
    );
  },
  walletDepositOnBehalf(agentId: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/wallet-center/deposit-on-behalf`,
      { method: 'POST', body },
    );
  },
  statementDashboard(agentId: string, params: Record<string, string | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statement-center/dashboard${agentCenterQuery(params)}`,
    );
  },
  statementOrders(agentId: string, params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statement-orders${agentCenterQuery(params)}`,
    );
  },
  listStatements(agentId: string) {
    return apiRequest<{ items: Array<Record<string, unknown>> }>(
      `/admin/agent-center/agents/${agentId}/statements`,
    );
  },
  getStatement(agentId: string, statementId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}`,
    );
  },
  generateStatement(agentId: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/generate`,
      { method: 'POST', body },
    );
  },
  lockStatement(agentId: string, statementId: string, body?: { reason?: string }) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}/lock`,
      { method: 'POST', body: body ?? {} },
    );
  },
  createStatementInvoice(agentId: string, statementId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}/invoice`,
      { method: 'POST', body: {} },
    );
  },
  listStatementAdjustments(agentId: string, params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/adjustments${agentCenterQuery(params)}`,
    );
  },
  createStatementAdjustment(agentId: string, body: Record<string, unknown>) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/adjustments`,
      { method: 'POST', body },
    );
  },
  exportStatement(agentId: string, params: Record<string, string | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/export${agentCenterQuery(params)}`,
    );
  },
  invoices(agentId: string, params: Record<string, number | undefined> = {}) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/invoices${agentCenterQuery(params)}`,
    );
  },
  getInvoice(agentId: string, invoiceId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/invoices/${invoiceId}`,
    );
  },
  cancelStatement(agentId: string, statementId: string, body?: { reason?: string }) {
    return apiRequest<{ ok: boolean }>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}/cancel`,
      { method: 'POST', body: body ?? {} },
    );
  },
  unlockStatement(agentId: string, statementId: string, body?: { reason?: string }) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}/unlock`,
      { method: 'POST', body: body ?? {} },
    );
  },
  markStatementPaid(agentId: string, statementId: string, body?: { note?: string }) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/statements/${statementId}/mark-paid`,
      { method: 'POST', body: body ?? {} },
    );
  },
  issueAgentInvoice(agentId: string, invoiceId: string) {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/invoices/${invoiceId}/issue`,
      { method: 'POST', body: {} },
    );
  },
  voidAgentInvoice(agentId: string, invoiceId: string, body: { reason: string }) {
    return apiRequest<{ ok: boolean }>(
      `/admin/agent-center/agents/${agentId}/invoices/${invoiceId}/void`,
      { method: 'POST', body },
    );
  },
  exportAgentInvoice(agentId: string, invoiceId: string, format: 'csv' | 'html' = 'csv') {
    return apiRequest<Record<string, unknown>>(
      `/admin/agent-center/agents/${agentId}/invoices/${invoiceId}/export?format=${format}`,
    );
  },
  updateMeta(agentId: string, body: { tags?: string[]; note?: string }) {
    return apiRequest<{ tags: string[]; notes: Array<Record<string, unknown>> }>(
      `/admin/agent-center/agents/${agentId}/meta`,
      { method: 'PATCH', body },
    );
  },
  getRegistrationMode() {
    return apiRequest<{ mode: string }>('/admin/agent-registration-mode');
  },
  getMarginConfig() {
    return apiRequest<{
      roundTo: number;
      applyScope: 'ALL_AGENTS';
      services: Record<string, { marginType: 'PERCENT' | 'FIXED'; value: number }>;
      labels: Record<string, string>;
      sampleCosts: Record<string, number | null>;
      defaults: {
        roundTo: number;
        services: Record<string, { marginType: 'PERCENT' | 'FIXED'; value: number }>;
      };
      lastUpdated: { at: string | null; email: string | null; role: string | null };
    }>('/admin/agent-center/margin-config');
  },
  updateMarginConfig(body: {
    roundTo?: number;
    services?: Record<string, { marginType: 'PERCENT' | 'FIXED'; value: number }>;
    reason?: string;
  }) {
    return apiRequest<{
      roundTo: number;
      applyScope: 'ALL_AGENTS';
      services: Record<string, { marginType: 'PERCENT' | 'FIXED'; value: number }>;
      labels: Record<string, string>;
      sampleCosts: Record<string, number | null>;
      defaults: {
        roundTo: number;
        services: Record<string, { marginType: 'PERCENT' | 'FIXED'; value: number }>;
      };
      lastUpdated: { at: string | null; email: string | null; role: string | null };
    }>('/admin/agent-center/margin-config', {
      method: 'PATCH',
      body,
    });
  },
};
