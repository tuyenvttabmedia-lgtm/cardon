import { createHmac, timingSafeEqual } from 'crypto';

/** Official SePay checkout field order. Do not reuse the retail signer order. */
export const ESIM_SEPAY_SIGNED_FIELD_ORDER = [
  'order_amount',
  'merchant',
  'currency',
  'operation',
  'order_description',
  'order_invoice_number',
  'customer_id',
  'payment_method',
  'success_url',
  'error_url',
  'cancel_url',
] as const;

export const ESIM_SEPAY_SANDBOX_CHECKOUT_URL = 'https://pay-sandbox.sepay.vn/v1/checkout/init';

export type EsimSepayCheckoutField = (typeof ESIM_SEPAY_SIGNED_FIELD_ORDER)[number];

export function isEsimSepaySignedFieldIncluded(value: string | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  return trimmed !== '' && trimmed !== '0';
}

export function buildEsimSepaySignedPayload(
  fields: Partial<Record<EsimSepayCheckoutField, string>>,
): string {
  return ESIM_SEPAY_SIGNED_FIELD_ORDER
    .filter((field) => isEsimSepaySignedFieldIncluded(fields[field]))
    .map((field) => `${field}=${fields[field]!.trim()}`)
    .join(',');
}

/** HMAC-SHA256 raw digest, Base64. The secret is not included in the payload. */
export function signEsimSepayCheckout(
  fields: Partial<Record<EsimSepayCheckoutField, string>>,
  merchantSecret: string,
): string {
  const payload = buildEsimSepaySignedPayload(fields);
  return createHmac('sha256', merchantSecret).update(payload).digest('base64');
}

export function buildEsimSepayCheckoutForm(
  fields: Partial<Record<EsimSepayCheckoutField, string>>,
  merchantSecret: string,
): Record<string, string> {
  const form: Record<string, string> = {};
  for (const field of ESIM_SEPAY_SIGNED_FIELD_ORDER) {
    const value = fields[field];
    if (!isEsimSepaySignedFieldIncluded(value)) continue;
    form[field] = value!.trim();
  }
  form.signature = signEsimSepayCheckout(fields, merchantSecret);
  return form;
}

export function secretsMatch(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
