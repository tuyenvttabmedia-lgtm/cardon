import type { AiraloCataloguePackageRow, ProductVariant } from '@/types/api';

export const SEPAY_SANDBOX_CHECKOUT_HOST = 'pay-sandbox.sepay.vn';

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
}): { action: string; fields: Record<string, string> } | null {
  const action = sepaySandboxCheckoutAction(input);
  const fields = input.checkoutFormFields;
  if (!action || !fields || Object.keys(fields).length === 0) return null;
  return { action, fields };
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
