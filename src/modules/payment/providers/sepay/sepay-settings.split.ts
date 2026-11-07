/**
 * VietQR HMAC and Payment Gateway IPN used to share webhookSecretEnc.
 * Old payment_gateway rows still have the IPN in that field. New rows keep them apart.
 */
export function splitStoredSepaySecrets(input: {
  integrationMode?: 'legacy_qr' | 'payment_gateway';
  hmacSecret?: string;
  ipnSecret?: string;
}): { hmacSecret?: string; ipnSecret?: string } {
  const hmac = input.hmacSecret?.trim() || undefined;
  const ipn = input.ipnSecret?.trim() || undefined;
  if (input.integrationMode === 'payment_gateway' && !ipn && hmac) {
    return { hmacSecret: undefined, ipnSecret: hmac };
  }
  return { hmacSecret: hmac, ipnSecret: ipn };
}
