import type { Payment } from '@/types/api';

const STORAGE_PREFIX = 'cardon:pending-qr:';

export type PendingQrPayment = {
  orderId: string;
  orderCode: string;
  email: string;
  amount: string;
  paymentUrl: string;
  bankInfo: Payment['bankInfo'];
  expiresAt: string | null;
  paymentReference: string;
  gateway: string;
  createdAt: number;
};

export function storePendingQrPayment(payload: PendingQrPayment): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(
    `${STORAGE_PREFIX}${payload.orderId}`,
    JSON.stringify(payload),
  );
}

export function readPendingQrPayment(orderId: string): PendingQrPayment | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${orderId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingQrPayment;
  } catch {
    return null;
  }
}

export function clearPendingQrPayment(orderId: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(`${STORAGE_PREFIX}${orderId}`);
}
