/** Keep in sync with `src/modules/auth/entities/normalize-register-phone.ts`. */
export function normalizeRegisterPhone(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let value = raw.trim().replace(/[\s.\-()]/g, '');
  if (!value) return '';

  if (value.startsWith('+84')) {
    value = `0${value.slice(3)}`;
  } else if (value.startsWith('84') && value.length >= 11) {
    value = `0${value.slice(2)}`;
  }

  return value.replace(/[^\d+]/g, '');
}

export function normalizeIdentityNumber(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const digits = raw.replace(/\D/g, '');
  return digits.length > 0 ? digits : undefined;
}
