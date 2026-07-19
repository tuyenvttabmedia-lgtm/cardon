import { randomUUID } from 'crypto';

export function generatePaymentReference(): string {
  return `PAY-${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}
