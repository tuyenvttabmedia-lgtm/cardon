import type { HomeCategory } from '@/lib/home-catalog';
import type { MessageKey } from '@/lib/i18n/messages';
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

export function validateCheckout(input: CheckoutValidationInput): MessageKey | null {
  if (!input.isAuthenticated) {
    return 'checkout.loginRequired';
  }
  if (!input.product) {
    return 'checkout.pickProduct';
  }
  if (!input.variant) {
    return 'checkout.pickDenom';
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 1) {
    return 'checkout.qtyMin';
  }

  const isTopup = input.category === 'topup' || input.variant.type === 'TOPUP';
  const isData = input.category === 'data' || input.variant.type === 'DATA';
  if (isTopup || isData) {
    if (!input.phone.trim()) {
      return 'checkout.phoneRequired';
    }
    if (!isValidVnPhone(input.phone)) {
      return 'checkout.phoneInvalid';
    }
  }

  if (input.category === 'game' || input.category === 'phone' || input.variant.type === 'CARD') {
    if (!input.isAuthenticated) {
      return 'checkout.cardLogin';
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
