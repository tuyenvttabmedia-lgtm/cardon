import type { HomeCategory } from '@/lib/home-catalog';
import type { PaymentGatewayCode } from '@/types/api';

export interface PendingCheckoutState {
  category: HomeCategory;
  productId: string | null;
  variantId: string | null;
  quantity: number;
  phone: string;
  gateway: PaymentGatewayCode;
  paymentMethodCode?: string;
}

const STORAGE_KEY = 'cardon_pending_checkout';

export function savePendingCheckout(state: PendingCheckoutState): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadPendingCheckout(): PendingCheckoutState | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingCheckoutState;
  } catch {
    return null;
  }
}

export function clearPendingCheckout(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function buildCheckoutRedirectUrl(): string {
  return '/?checkout=resume';
}
