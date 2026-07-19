import { vi } from '@/lib/i18n/vi';
import { translateRole } from '@/lib/i18n';

export const APP_NAME = vi.app.name;

function isLocalDevApiUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url);
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

export function downloadBlob(content: string, filename: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadArrayBuffer(buffer: ArrayBuffer, filename: string, mime: string) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const ROLE_LABELS: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  {
    get: (_t, prop: string) => translateRole(prop),
  },
);
