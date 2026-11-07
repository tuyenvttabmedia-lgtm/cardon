/**
 * Official SePay PG signed-field order. Postgres jsonb reorders object keys, so the
 * browser must rebuild the POST body in this order or checkout/init returns
 * "Yêu cầu không hợp lệ" even when the HMAC itself is correct.
 */
export const SEPAY_CHECKOUT_FIELD_ORDER = [
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

export function orderedSepayCheckoutEntries(
  fields: Record<string, string>,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  const seen = new Set<string>();

  for (const key of SEPAY_CHECKOUT_FIELD_ORDER) {
    const value = fields[key];
    if (value == null || value === '') continue;
    entries.push([key, value]);
    seen.add(key);
  }

  for (const [key, value] of Object.entries(fields)) {
    if (key === 'signature' || seen.has(key) || value == null || value === '') continue;
    entries.push([key, value]);
    seen.add(key);
  }

  if (fields.signature) {
    entries.push(['signature', fields.signature]);
  }

  return entries;
}
