export const PORTAL_NAME = 'CardOn Agent Platform';
export const PORTAL_DESCRIPTION =
  'Cổng đối tác CardOn — quản lý KYC, số dư, API và giao dịch B2B';

function isLocalDevApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
}

export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (typeof window !== 'undefined') {
    if (!configured || isLocalDevApiUrl(configured)) return window.location.origin;
    return configured;
  }
  return configured ?? 'http://localhost:3002';
}

export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (typeof window !== 'undefined') {
    const sameOrigin = `${window.location.origin}/api/v1`;
    if (!configured || isLocalDevApiUrl(configured)) return sameOrigin;
    return configured.replace(/\/$/, '');
  }
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:3000/api/v1';
}

export function getPartnerApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_PARTNER_API_URL?.trim();
  if (typeof window !== 'undefined') {
    const sameOrigin = `${window.location.origin}/api/partner/v1`;
    if (!configured || isLocalDevApiUrl(configured)) return sameOrigin;
    return configured.replace(/\/$/, '');
  }
  if (configured) return configured.replace(/\/$/, '');
  return 'http://localhost:3000/api/partner/v1';
}

export function getCustomerSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL?.trim();
  if (configured && !isLocalDevApiUrl(configured)) return configured;
  if (typeof window !== 'undefined' && window.location.hostname === 'partner.localhost') {
    return 'http://localhost';
  }
  return 'https://cardon.vn';
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatVnd(amount: string | number): string {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString('vi-VN');
}

export function agentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING_KYC: 'Chờ KYC',
    ACTIVE: 'Hoạt động',
    SUSPENDED: 'Tạm ngưng',
    REJECTED: 'Từ chối',
  };
  return map[status] ?? status;
}

export function kycStatusLabel(status: string | null | undefined): string {
  if (!status || status === 'PENDING') return 'Chờ nộp';
  const map: Record<string, string> = {
    SUBMITTED: 'Đang duyệt',
    APPROVED: 'Đã duyệt',
    REJECTED: 'Từ chối',
    NEED_MORE_INFO: 'Cần bổ sung',
  };
  return map[status] ?? status;
}

export function ledgerTypeLabel(type: string): string {
  const map: Record<string, string> = {
    CREDIT: 'Nạp hạn mức',
    HOLD: 'Giữ hạn mức',
    DEBIT: 'Trừ hạn mức',
    RELEASE: 'Hoàn giữ',
  };
  return map[type] ?? type;
}

export function transactionStatusLabel(status: string): string {
  const map: Record<string, string> = {
    SUCCESS: 'Thành công',
    PROCESSING: 'Đang xử lý',
    FAILED: 'Thất bại',
  };
  return map[status] ?? status;
}
