import type { HomeCategory } from '@/lib/home-catalog';
import type { Product, ProductVariant } from '@/types/api';

const VN_PHONE_RE = /^(0|\+84)(3|5|7|8|9)[0-9]{8}$/;

export function normalizeVnPhone(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, '');
  if (trimmed.startsWith('+84')) return `0${trimmed.slice(3)}`;
  return trimmed;
}

export function isValidVnPhone(input: string): boolean {
  const n = normalizeVnPhone(input);
  return VN_PHONE_RE.test(n);
}

export interface CheckoutValidationInput {
  product: Product | null;
  variant: ProductVariant | null;
  quantity: number;
  category: HomeCategory;
  phone: string;
  isAuthenticated: boolean;
}

export function validateCheckout(input: CheckoutValidationInput): string | null {
  if (!input.isAuthenticated) {
    return 'Vui lòng đăng nhập để tiếp tục thanh toán';
  }
  if (!input.product) {
    return 'Vui lòng chọn loại thẻ / nhà cung cấp';
  }
  if (!input.variant) {
    return 'Vui lòng chọn mệnh giá';
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 1) {
    return 'Số lượng phải từ 1 trở lên';
  }

  const isTopup = input.category === 'topup' || input.variant.type === 'TOPUP';
  const isData = input.category === 'data' || input.variant.type === 'DATA';
  if (isTopup || isData) {
    if (!input.phone.trim()) {
      return 'Vui lòng nhập số điện thoại cần nạp';
    }
    if (!isValidVnPhone(input.phone)) {
      return 'Số điện thoại không hợp lệ (VD: 0912345678)';
    }
  }

  if (input.category === 'game' || input.category === 'phone' || input.variant.type === 'CARD') {
    if (!input.isAuthenticated) {
      return 'Mua thẻ yêu cầu đăng nhập tài khoản';
    }
  }

  return null;
}

export function collectClientDeviceInfo(): Record<string, string | number | boolean> {
  if (typeof window === 'undefined') return {};
  return {
    platform: navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    touch: 'ontouchstart' in window,
  };
}
