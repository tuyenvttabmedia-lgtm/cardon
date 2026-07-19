const STORAGE_PREFIX = 'cardon:order-email:';

export function orderGuestEmailStorageKey(orderId: string): string {
  return `${STORAGE_PREFIX}${orderId}`;
}

export function readStoredOrderGuestEmail(orderId: string): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(orderGuestEmailStorageKey(orderId))?.trim() ?? '';
}

export function storeOrderGuestEmail(orderId: string, email: string): void {
  const normalized = email.trim();
  if (!normalized || typeof window === 'undefined') return;
  sessionStorage.setItem(orderGuestEmailStorageKey(orderId), normalized);
}

export function resolveOrderGuestEmail(orderId: string, urlEmail?: string | null): string {
  const fromUrl = urlEmail?.trim() ?? '';
  if (fromUrl) {
    storeOrderGuestEmail(orderId, fromUrl);
    return fromUrl;
  }
  return readStoredOrderGuestEmail(orderId);
}
