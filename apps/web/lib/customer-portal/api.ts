import { apiRequest } from '@/services/api-client';
import type { AccountProfile } from '@/types/api';

export interface CustomerDashboard {
  cards: {
    ordersToday: number;
    successToday: number;
    processingToday: number;
    pinCount: number;
    unreadNotifications: number;
    lastLoginAt: string | null;
  };
  recent: {
    orders: CustomerOrderRow[];
    pins: CustomerPinRow[];
    notifications: CustomerNotificationRow[];
  };
}

export interface CustomerOrderRow {
  id: string;
  orderCode: string;
  totalAmount: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  customerStatus: string;
  paymentGateway: string | null;
  createdAt: string;
  payment?: { id: string; paymentReference: string; gateway: string; status: string } | null;
  items: Array<{ productName: string; variantName: string; variantType: string; quantity: number }>;
}

export interface CustomerPinRow {
  orderId: string;
  orderCode: string;
  productName: string;
  cardId: string;
  serial: string;
  pinViewCount: number;
  createdAt: string;
  status: string;
}

export interface CustomerNotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  group: 'order' | 'pin' | 'promo' | 'system';
  readAt: string | null;
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  skip: number;
  take: number;
}

function qs(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const customerCenterApi = {
  getDashboard() {
    return apiRequest<CustomerDashboard>('/customers/me/dashboard');
  },
  listOrders(params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Paginated<CustomerOrderRow>>(`/customers/me/orders${qs(params)}`);
  },
  getOrder(id: string) {
    return apiRequest<{
      order: import('@/types/api').Order;
      timeline: import('@/types/api').OrderDeliveryResponse['timeline'];
      delivery: import('@/types/api').OrderDeliveryResponse['delivery'];
      payment: { id: string; reference: string; gateway: string; status: string; paidAt: string | null } | null;
      product: Array<{ name: string; variant: string; sku: string; quantity: number; type: string }>;
      emailHistory: Array<{ at: string; type: string; message: string }>;
      gateway: string | null;
      provider: string;
    }>(`/customers/me/orders/${id}`);
  },
  resendEmail(orderId: string) {
    return apiRequest<{ ok: boolean; message: string }>(`/customers/me/orders/${orderId}/resend-email`, {
      method: 'POST',
    });
  },
  listPins(params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Paginated<CustomerPinRow>>(`/customers/me/pins${qs(params)}`);
  },
  listNotifications(params: Record<string, string | number | undefined> = {}) {
    return apiRequest<Paginated<CustomerNotificationRow>>(`/customers/me/notifications${qs(params)}`);
  },
  deleteNotification(id: string) {
    return apiRequest<{ deleted: number }>(`/customers/me/notifications/${id}`, { method: 'DELETE' });
  },
  search(q: string) {
    return apiRequest<{
      orders: CustomerOrderRow[];
      pins: CustomerPinRow[];
      notifications: CustomerNotificationRow[];
    }>(`/customers/me/search${qs({ q })}`);
  },
  getProfile() {
    return apiRequest<AccountProfile>('/customers/me/profile');
  },
  updateProfile(body: { fullName?: string; phone?: string }) {
    return apiRequest<AccountProfile>('/customers/me/profile', { method: 'PATCH', body });
  },
  changePassword(body: { oldPassword: string; newPassword: string; confirmPassword: string }) {
    return apiRequest<{ message: string }>('/customers/me/change-password', { method: 'POST', body });
  },
  listSessions() {
    return apiRequest<{ items: Array<{ id: string; createdAt: string; expiresAt: string; active: boolean }> }>(
      '/customers/me/security/sessions',
    );
  },
  revokeOtherSessions() {
    return apiRequest<{ ok: boolean; message: string }>('/customers/me/security/revoke-others', {
      method: 'POST',
    });
  },
  closeTicket(ticketId: string) {
    return apiRequest<{ ok: boolean }>(`/customers/me/support/tickets/${ticketId}/close`, { method: 'POST' });
  },
};
