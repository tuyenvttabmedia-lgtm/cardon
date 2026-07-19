import { randomUUID } from 'crypto';

export function generateProviderRequestId(): string {
  return `PRV-${randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase()}`;
}
