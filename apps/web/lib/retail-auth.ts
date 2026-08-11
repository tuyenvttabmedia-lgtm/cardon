import { getPartnerPortalUrl } from '@/lib/utils';

export const RETAIL_CUSTOMER_ROLE = 'CUSTOMER';

export function isRetailCustomerRole(role: string | null | undefined): boolean {
  return role === RETAIL_CUSTOMER_ROLE;
}

export function wrongRetailPortalMessage(role: string | null | undefined): string {
  if (role === 'AGENT') {
    return 'Tài khoản đại lý không dùng được trên website bán lẻ. Vui lòng đăng nhập tại Cổng đối tác.';
  }
  return 'Tài khoản này không dùng được trên website bán lẻ CardOn.';
}

export function partnerLoginUrl(): string {
  return `${getPartnerPortalUrl()}/login`;
}
