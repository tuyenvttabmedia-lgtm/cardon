import type { StoredPaymentMethod } from '../../settings/entities/settings.constants';
import { normalizeSettlementType } from './payment-settlement.constants';

/** Legacy config codes from Phase 6O.18 → customer methodCode */
export const LEGACY_METHOD_CODE_MAP: Record<string, string> = {
  SEPAY_VA_QR: 'VIETQR',
  SEPAY_NAPAS_QR: 'NAPAS_247',
  MEGAPAY_ATM: 'ATM',
  MEGAPAY_VISA: 'VISA',
  MEGAPAY_WALLET: 'WALLET',
  BANK_QR: 'VIETQR',
  BANK_GATEWAY: 'ATM',
};

export function normalizeMethodCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return LEGACY_METHOD_CODE_MAP[upper] ?? upper;
}

export function normalizeStoredPaymentMethod(
  raw: Partial<StoredPaymentMethod> & { code?: string; name?: string; gateway?: string },
): StoredPaymentMethod | null {
  const legacyCode = raw.methodCode ?? raw.code;
  if (!legacyCode) return null;

  const methodCode = normalizeMethodCode(legacyCode);
  const gatewayCode = (raw.gatewayCode ?? raw.gateway ?? 'SEPAY') as StoredPaymentMethod['gatewayCode'];

  return {
    gatewayCode,
    methodCode,
    displayName: raw.displayName ?? raw.name ?? methodCode,
    description: raw.description ?? '',
    iconUrl: raw.iconUrl ?? null,
    logoUrl: raw.logoUrl ?? null,
    settlementType: normalizeSettlementType(raw.settlementType, gatewayCode),
    enabled: Boolean(raw.enabled),
    percentageFee: Number(raw.percentageFee ?? 0),
    fixedFee: Number(raw.fixedFee ?? 0),
  };
}
