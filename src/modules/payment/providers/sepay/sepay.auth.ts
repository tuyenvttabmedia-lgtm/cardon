import { createHmac, timingSafeEqual } from 'crypto';

export function verifySepayApiKey(
  headers: Record<string, string>,
  expectedApiKey: string,
): boolean {
  const auth =
    headers.authorization ??
    headers.Authorization ??
    headers['x-authorization'] ??
    '';
  const expected = `Apikey ${expectedApiKey}`;
  if (!auth || auth.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(auth), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifySepayHmacSignature(
  headers: Record<string, string>,
  rawBody: string,
  webhookSecret: string,
): boolean {
  const signatureHeader =
    headers['x-sepay-signature'] ?? headers['X-SePay-Signature'] ?? '';
  const timestamp =
    headers['x-sepay-timestamp'] ?? headers['X-SePay-Timestamp'] ?? '';

  if (!signatureHeader || !timestamp || !webhookSecret) {
    return false;
  }

  const provided = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice(7)
    : signatureHeader;

  const canonical = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', webhookSecret)
    .update(canonical)
    .digest('hex');

  if (provided.length !== expected.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function verifySepayWebhookAuth(
  headers: Record<string, string>,
  rawBody: string | undefined,
  config: {
    apiKey?: string;
    webhookSecret?: string;
    ipnSecretKey?: string;
  },
): boolean {
  if (config.ipnSecretKey) {
    const pgSecret =
      headers['x-secret-key'] ??
      headers['X-Secret-Key'] ??
      headers['X-SECRET-KEY'] ??
      '';
    if (pgSecret && pgSecret === config.ipnSecretKey) {
      return true;
    }
  }

  if (config.apiKey && verifySepayApiKey(headers, config.apiKey)) {
    return true;
  }

  if (config.webhookSecret && rawBody) {
    return verifySepayHmacSignature(headers, rawBody, config.webhookSecret);
  }

  return false;
}
