/** Max VND amount for settings thresholds (999 tỷ). */
export const VND_SETTINGS_MAX = 999_999_999_999;

export function formatVndDigits(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(amount);
}

export function parseVndDigits(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10);
}

export function validateVndAmount(value: number, allowZero = true): string | null {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return 'Giá trị phải là số nguyên';
  }
  if (value < 0) return 'Không được nhập số âm';
  if (!allowZero && value === 0) return 'Giá trị phải lớn hơn 0';
  if (value > VND_SETTINGS_MAX) {
    return `Giá trị tối đa ${formatVndDigits(VND_SETTINGS_MAX)} đ`;
  }
  return null;
}
