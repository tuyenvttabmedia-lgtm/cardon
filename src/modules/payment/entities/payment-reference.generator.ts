import { randomInt, randomUUID } from 'crypto';

export function generatePaymentReference(): string {
  return `PAY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

/**
 * SePay bank-transfer payment code (field `code` / transfer content).
 * Matches company payment-code structure with prefix DH (default suffix 6–8 digits).
 * @see https://developer.sepay.vn/vi/sepay-webhooks/cau-hinh-ma-thanh-toan
 */
export function generateSepayPaymentCode(): string {
  const suffix = String(randomInt(0, 100_000_000)).padStart(8, '0');
  return `DH${suffix}`;
}
