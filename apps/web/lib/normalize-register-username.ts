/** Keep in sync with `src/modules/auth/entities/normalize-register-username.ts`. */
export function normalizeRegisterUsername(raw: unknown, maxLength = 32): string {
  if (typeof raw !== 'string') return '';
  let value = raw.trim();
  if (!value) return '';

  if (value.includes('@')) {
    value = value.split('@')[0] ?? value;
  }

  value = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[\s.\-+]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (value.length > maxLength) {
    value = value.slice(0, maxLength).replace(/_+$/g, '');
  }
  return value;
}
