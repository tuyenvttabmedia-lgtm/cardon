import { randomBytes } from 'crypto';

export function generateOrderCode(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${date}-${suffix}`;
}

export function generateTransactionId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `TXN-${date}-${suffix}`;
}
