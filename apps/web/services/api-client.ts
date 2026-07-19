import { getApiBaseUrl } from '@/lib/utils';
import { getAccessToken, getRefreshToken, setAuthSession, clearAuthSession, getStoredUser } from '@/lib/auth-storage';
import type {
  AccountCard,
  AccountOrder,
  AccountProfile,
  AccountTopup,
  AccountDataOrder,
  ApiErrorResponse,
  ApiSuccessResponse,
  AuthResult,
  CreateOrderPayload,
  CreatePaymentPayload,
  Category,
  Order,
  OrderCardsResponse,
  OrderDeliveryResponse,
  Payment,
  Product,
  RegisterPayload,
} from '@/types/api';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>,
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
  if (!contentType.includes('application/json')) {
    throw new ApiClientError(
      response.ok ? 'Phản hồi API không hợp lệ (không phải JSON)' : `Yêu cầu thất bại (${response.status})`,
      response.status,
    );
  }

  const payload = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse;

  if (!response.ok || !('success' in payload) || !payload.success) {
    const errorPayload = payload as ApiErrorResponse;
    const { code, message, ...rest } = errorPayload.error ?? { code: undefined, message: undefined };
    throw new ApiClientError(
      message ?? 'Yêu cầu thất bại',
      response.status,
      code,
      rest,
    );
  }

  return payload.data;
}

export async function refreshAccessToken(): Promise<string | null> {
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
  const user = getStoredUser();
  setAuthSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user,
  });
  return data.accessToken;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (options.auth !== false) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
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
  login(identifier: string, password: string) {
    return apiRequest<AuthResult>('/auth/login', {
      method: 'POST',
      body: { identifier, password },
      auth: false,
    });
  },
  register(payload: RegisterPayload) {
    return apiRequest<AuthResult>('/auth/register', {
      method: 'POST',
      body: payload,
      auth: false,
    });
  },
  agentRegister(payload: {
    accountType: 'PERSONAL' | 'HOUSEHOLD' | 'COMPANY';
    email: string;
    phone: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
    inviteToken?: string;
  }) {
    return apiRequest<{
      ok: boolean;
      requiresEmailVerification: boolean;
      email: string;
      message: string;
      partnerLoginUrl: string;
    }>('/auth/agent-register', {
      method: 'POST',
      body: payload,
      auth: false,
    });
  },
  forgotPassword(email: string) {
    return apiRequest<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    });
  },
  resetPassword(token: string, newPassword: string) {
    return apiRequest<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword },
      auth: false,
    });
  },
  me() {
    return apiRequest<AuthResult['user'] & { permissions?: string[] }>('/auth/me');
  },
};

export const contactApi = {
  submit(body: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  }) {
    return apiRequest<{ id: string; message: string }>('/contact', {
      method: 'POST',
      body,
      auth: false,
    });
  },
};

export const accountApi = {
  getProfile() {
    return apiRequest<AccountProfile>('/account/profile');
  },
  updateProfile(body: { fullName?: string; phone?: string }) {
    return apiRequest<AccountProfile>('/account/profile', { method: 'PATCH', body });
  },
  changePassword(body: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    return apiRequest<{ message: string }>('/account/change-password', { method: 'POST', body });
  },
  listOrders(
    tab: 'all' | 'processing' | 'completed' = 'all',
    type?: 'CARD' | 'TOPUP' | 'DATA',
    skip = 0,
    take = 15,
  ) {
    const params = new URLSearchParams();
    if (tab !== 'all') params.set('tab', tab);
    if (type) params.set('type', type);
    if (skip > 0) params.set('skip', String(skip));
    if (take !== 15) params.set('take', String(take));
    const qs = params.toString();
    return apiRequest<import('@/types/api').PaginatedList<AccountOrder>>(
      `/account/orders${qs ? `?${qs}` : ''}`,
    );
  },
  listCards(skip = 0, take = 15) {
    const params = new URLSearchParams();
    if (skip > 0) params.set('skip', String(skip));
    if (take !== 15) params.set('take', String(take));
    const qs = params.toString();
    return apiRequest<import('@/types/api').PaginatedList<AccountCard>>(
      `/account/cards${qs ? `?${qs}` : ''}`,
    );
  },
  listTopups(skip = 0, take = 15) {
    const params = new URLSearchParams();
    if (skip > 0) params.set('skip', String(skip));
    if (take !== 15) params.set('take', String(take));
    const qs = params.toString();
    return apiRequest<import('@/types/api').PaginatedList<AccountTopup>>(
      `/account/topups${qs ? `?${qs}` : ''}`,
    );
  },
  listDataOrders() {
    return apiRequest<AccountDataOrder[]>('/account/data');
  },
};

export const notificationApi = {
  list() {
    return apiRequest<import('@/types/api').UserNotification[]>('/account/notifications');
  },
  unreadCount() {
    return apiRequest<{ count: number }>('/account/notifications/unread-count');
  },
  markRead(id: string) {
    return apiRequest<{ count: number }>(`/account/notifications/${id}/read`, { method: 'PATCH' });
  },
  markAllRead() {
    return apiRequest<{ count: number }>('/account/notifications/read-all', { method: 'PATCH' });
  },
};

export const supportApi = {
  listTickets() {
    return apiRequest<import('@/types/api').SupportTicket[]>('/account/support/tickets');
  },
  getTicket(id: string) {
    return apiRequest<import('@/types/api').SupportTicket>(`/account/support/tickets/${id}`);
  },
  createTicket(body: {
    subject: string;
    message: string;
    orderId?: string;
    priority?: 'LOW' | 'NORMAL' | 'HIGH';
  }) {
    return apiRequest<import('@/types/api').SupportTicket>('/account/support/tickets', {
      method: 'POST',
      body,
    });
  },
  addMessage(ticketId: string, body: { message: string; attachmentUrl?: string }) {
    return apiRequest<import('@/types/api').SupportTicket>(
      `/account/support/tickets/${ticketId}/messages`,
      { method: 'POST', body },
    );
  },
  async uploadScreenshot(file: File) {
    const form = new FormData();
    form.append('file', file);
    const token = getAccessToken();
    const response = await fetch(`${getApiBaseUrl()}/account/support/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    return parseResponse<{ url: string }>(response);
  },
};

export const productApi = {
  listCategories() {
    return apiRequest<Category[]>('/products/categories', { auth: false });
  },
  listProducts() {
    return apiRequest<Product[]>('/products', { auth: false });
  },
  getProduct(id: string) {
    return apiRequest<Product>(`/products/${id}`, { auth: false });
  },
};

export const orderApi = {
  create(payload: CreateOrderPayload) {
    return apiRequest<Order>('/orders', { method: 'POST', body: payload });
  },
  lookup(orderCode: string, email: string) {
    const params = new URLSearchParams({ orderCode, email });
    return apiRequest<OrderDeliveryResponse>(`/orders/lookup?${params}`, { auth: false });
  },
  lookupDelivery(orderCode: string, email: string) {
    const params = new URLSearchParams({ orderCode, email });
    return apiRequest<OrderDeliveryResponse>(`/orders/lookup/delivery?${params}`, {
      auth: false,
    });
  },
  getDelivery(orderId: string, guestEmail?: string) {
    const params = guestEmail ? `?email=${encodeURIComponent(guestEmail)}` : '';
    return apiRequest<OrderDeliveryResponse>(`/orders/${orderId}/delivery${params}`, {
      auth: !guestEmail,
    });
  },
  revealPin(orderId: string, cardId: string, guestEmail?: string) {
    return apiRequest<import('@/types/api').RevealPinResponse>(
      `/orders/${orderId}/cards/${cardId}/reveal-pin`,
      {
        method: 'POST',
        body: guestEmail ? { email: guestEmail } : {},
        auth: !guestEmail,
      },
    );
  },
  getById(id: string) {
    return apiRequest<Order>(`/orders/${id}`);
  },
  list() {
    return apiRequest<Order[]>('/orders');
  },
  lookupCards(orderCode: string, email: string) {
    const params = new URLSearchParams({ orderCode, email });
    return apiRequest<OrderCardsResponse>(`/orders/lookup/cards?${params}`, {
      auth: false,
    });
  },
  getCards(orderId: string) {
    return apiRequest<OrderCardsResponse>(`/orders/${orderId}/cards`);
  },
};

export const paymentApi = {
  create(payload: CreatePaymentPayload, idempotencyKey: string) {
    return apiRequest<Payment>('/payments', {
      method: 'POST',
      body: payload,
      headers: { 'idempotency-key': idempotencyKey },
    });
  },
};
