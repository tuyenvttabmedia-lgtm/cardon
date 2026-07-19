import { createHmac, timingSafeEqual } from 'crypto';

export function buildCanonicalString(
  fields: Record<string, string | number | boolean>,
): string {
  return Object.keys(fields)
    .filter((key) => key !== 'signature' && fields[key] !== undefined && fields[key] !== '')
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
}

export function signMegapayRequest(
  fields: Record<string, string | number | boolean>,
  secretKey: string,
): string {
  const canonical = buildCanonicalString(fields);
  return createHmac('sha256', secretKey).update(canonical).digest('hex');
}

export function verifyMegapaySignature(
  fields: Record<string, string | number | boolean>,
  signature: string,
  secret: string,
): boolean {
  if (!signature) {
    return false;
  }
  const expected = signMegapayRequest(fields, secret);
  if (signature.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function toSignableFields(
  payload: Record<string, unknown>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === 'signature' || value == null) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    } else {
      result[key] = String(value);
    }
  }
  return result;
}
