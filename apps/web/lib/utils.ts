export const SITE_NAME = 'CardOn.vn';
export const SITE_DESCRIPTION =
  'Mua thẻ game, thẻ điện thoại và nạp tiền nhanh chóng, an toàn tại CardOn.vn';

export function getPartnerPortalUrl(): string {
  if (process.env.NEXT_PUBLIC_PARTNER_SITE_URL) {
    return process.env.NEXT_PUBLIC_PARTNER_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://partner.localhost';
  }
  return 'https://partner.cardon.vn';
}

export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost';
  }
  return 'https://cardon.vn';
}

export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    const internal = (process.env.API_INTERNAL_URL ?? process.env.INTERNAL_API_URL)?.trim();
    if (internal) {
      return internal.replace(/\/$/, '');
    }
  }
  const publicUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (publicUrl) return publicUrl.replace(/\/$/, '');
  return 'http://localhost:3000/api/v1';
}

export function formatVnd(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function paymentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    WAITING_PAYMENT: 'Chờ thanh toán',
    PAID: 'Đã thanh toán',
    FAILED: 'Thanh toán thất bại',
    EXPIRED: 'Đã hết hạn',
    REFUNDED: 'Đã hoàn tiền',
  };
  return map[status] ?? status;
}

export function fulfillmentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Chờ xử lý',
    PROCESSING: 'Đang giao thẻ',
    COMPLETED: 'Hoàn tất',
    FAILED: 'Thất bại',
    WAITING_ADMIN_RETRY: 'Đang xử lý',
  };
  return map[status] ?? status;
}

export function canRevealCards(order: {
  paymentStatus: string;
  fulfillmentStatus: string;
}): boolean {
  return (
    order.paymentStatus === 'PAID' && order.fulfillmentStatus === 'COMPLETED'
  );
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
