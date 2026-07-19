/** Mask PIN for admin list/detail — never expose real PIN. */
export function maskPinDisplay(): string {
  return '************';
}

export function maskPinPartial(pin: string): string {
  const digits = pin.replace(/\s/g, '');
  if (digits.length <= 4) return maskPinDisplay();
  return `**** **** ${digits.slice(-4)}`;
}

export const ADMIN_PIN_VIEW_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

export function canAdminViewPin(role: string): boolean {
  return (ADMIN_PIN_VIEW_ROLES as readonly string[]).includes(role);
}
