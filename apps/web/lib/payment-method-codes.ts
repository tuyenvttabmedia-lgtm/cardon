/** Client-side legacy method code normalization (mirrors backend). */
const LEGACY_METHOD_CODE_MAP: Record<string, string> = {
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
