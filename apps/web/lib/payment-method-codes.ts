/** Client-side legacy method code normalization (mirrors backend). */
const LEGACY_METHOD_CODE_MAP: Record<string, string> = {
  SEPAY_VA_QR: 'VIETQR',
  SEPAY_NAPAS_QR: 'NAPAS_247',
  MEGAPAY_ATM: 'DEPOSIT_CODE',
  MEGAPAY_VISA: 'VNPAYQR',
  MEGAPAY_WALLET: 'ZALOPAY',
  ATM: 'DEPOSIT_CODE',
  VISA: 'VNPAYQR',
  WALLET: 'ZALOPAY',
  BANK_QR: 'VIETQR',
  BANK_GATEWAY: 'DEPOSIT_CODE',
};

export function normalizeMethodCode(code: string): string {
  const upper = code.trim().toUpperCase();
  return LEGACY_METHOD_CODE_MAP[upper] ?? upper;
}
