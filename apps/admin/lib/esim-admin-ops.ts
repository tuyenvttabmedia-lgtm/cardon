import type { AiraloCataloguePackageRow, ProductVariant } from '@/types/api';

export const SEPAY_SANDBOX_CHECKOUT_HOST = 'pay-sandbox.sepay.vn';

/** Official SePay signed-field order — jsonb key order is not stable. */
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
  }
  if (fields.signature) entries.push(['signature', fields.signature]);
  return entries;
}

export function publishedEsimVariantIds(packages: AiraloCataloguePackageRow[]): Set<string> {
  return new Set(
    packages
      .filter((row) => row.lifecycle === 'PUBLISHED' && row.variantId)
      .map((row) => row.variantId as string),
  );
}

export function isEsimTestOrderVariant(
  variant: ProductVariant,
  publishedIds: Set<string>,
): boolean {
  if (variant.status !== 'ACTIVE') return false;
  if (!publishedIds.has(variant.id)) return false;
  const mappings = variant.providerMappings;
  if (!mappings) return false;
  return mappings.some(
    (mapping) =>
      mapping.provider?.code === 'AIRALO' &&
      mapping.status === 'ACTIVE' &&
      (mapping.availability == null || mapping.availability === 'AVAILABLE'),
  );
}

export function checkoutHost(url?: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function sepaySandboxCheckoutAction(input: {
  checkoutUrl?: string;
  paymentUrl?: string;
}): string | null {
  const url = input.checkoutUrl || input.paymentUrl;
  return checkoutHost(url) === SEPAY_SANDBOX_CHECKOUT_HOST ? url ?? null : null;
}

/** POST form is only opened when host is Sandbox and signed fields exist. */
export function sandboxCheckoutForm(input: {
  checkoutUrl?: string;
  paymentUrl?: string;
  checkoutFormFields?: Record<string, string>;
}): { action: string; fields: Array<[string, string]> } | null {
  const action = sepaySandboxCheckoutAction(input);
  const fields = input.checkoutFormFields;
  if (!action || !fields || Object.keys(fields).length === 0) return null;
  return { action, fields: orderedSepayCheckoutEntries(fields) };
}

export function canCreateTestPayment(input: {
  role?: string | null;
  userEmail?: string | null;
  customerEmail?: string | null;
  paymentStatus?: string | null;
  payments?: Array<{ status: string }>;
}): boolean {
  if (input.role !== 'SUPER_ADMIN') return false;
  if (!input.userEmail || !input.customerEmail) return false;
  if (input.userEmail.trim().toLowerCase() !== input.customerEmail.trim().toLowerCase()) {
    return false;
  }
  if (input.paymentStatus !== 'WAITING_PAYMENT') return false;
  const blocking = (input.payments ?? []).some((payment) => {
    const status = payment.status.toUpperCase();
    return status === 'PENDING' || status === 'SUCCESS';
  });
  return !blocking;
}
