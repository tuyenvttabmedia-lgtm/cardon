import { createHmac } from 'crypto';

export function signWebhookBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function maskSignature(signature: string): string {
  if (signature.length <= 8) return '••••••••';
  return `${signature.slice(0, 4)}${'•'.repeat(24)}${signature.slice(-4)}`;
}
