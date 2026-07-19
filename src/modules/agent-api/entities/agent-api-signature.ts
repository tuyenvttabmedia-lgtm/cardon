import { createHash, createHmac, timingSafeEqual } from 'crypto';

export function buildSignaturePayload(
  method: string,
  path: string,
  requestId: string,
  rawBody: string,
): string {
  const bodyHash = createHash('sha256').update(rawBody).digest('hex');
  return `${method.toUpperCase()}:${path}:${requestId}:${bodyHash}`;
}

export function signPartnerRequest(secretKey: string, payload: string): string {
  return createHmac('sha256', secretKey).update(payload).digest('hex');
}

export function verifyPartnerSignature(
  secretKey: string,
  payload: string,
  signature: string,
): boolean {
  const expected = signPartnerRequest(secretKey, payload);
  if (!signature || signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
