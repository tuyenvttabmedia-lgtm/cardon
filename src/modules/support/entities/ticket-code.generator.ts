import { randomBytes } from 'crypto';

export function generateTicketCode(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `TK-${date}-${suffix}`;
}
