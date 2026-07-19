export const UNSAFE_SECRET_PATTERNS = [
  /^change-me/i,
  /^changeme/i,
  /^your-secret/i,
  /^test-secret/i,
  /^dev-secret/i,
  /^01234567890123456789012345678901$/,
];

export function isUnsafeSecret(value: string | undefined): boolean {
  if (!value || value.trim().length === 0) {
    return true;
  }
  return UNSAFE_SECRET_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

export function assertProductionEnv(env: Record<string, unknown>): void {
  if (env.APP_ENV !== 'production') {
    return;
  }

  const errors: string[] = [];

  if (env.ESALE_USE_MOCK === true || env.ESALE_USE_MOCK === 'true') {
    errors.push('ESALE_USE_MOCK must not be true in production');
  }

  for (const key of ['JWT_SECRET', 'ENCRYPTION_KEY'] as const) {
    const value = env[key];
    if (typeof value === 'string' && isUnsafeSecret(value)) {
      errors.push(`${key} uses an unsafe development placeholder`);
    }
  }

  if (!env.APP_PUBLIC_URL) {
    errors.push('APP_PUBLIC_URL is required in production');
  }

  if (!env.CORS_ORIGINS) {
    errors.push('CORS_ORIGINS is required in production');
  }

  if (!env.SMTP_HOST) {
    errors.push('SMTP_HOST is required in production');
  }

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    errors.push('SMTP_USER and SMTP_PASS are required in production');
  }

  if (!env.ADMIN_ALERT_EMAIL) {
    errors.push('ADMIN_ALERT_EMAIL is required in production');
  }

  const megapayKeys = [
    'MEGAPAY_MERCHANT_ID',
    'MEGAPAY_SECRET_KEY',
    'MEGAPAY_ENDPOINT',
    'MEGAPAY_WEBHOOK_SECRET',
  ] as const;
  for (const key of megapayKeys) {
    if (!env[key]) {
      errors.push(`${key} is required in production`);
    }
  }

  const sepayKeys = ['SEPAY_API_KEY', 'SEPAY_WEBHOOK_SECRET', 'SEPAY_BANK_ACCOUNT'] as const;
  for (const key of sepayKeys) {
    if (!env[key]) {
      errors.push(`${key} is required in production`);
    }
  }

  const esaleKeys = [
    'ESALE_API_URL_CARD',
    'ESALE_AGENCY_CODE',
    'ESALE_SECRET_KEY',
    'ESALE_PRIVATE_KEY',
    'ESALE_PUBLIC_KEY',
  ] as const;
  for (const key of esaleKeys) {
    if (!env[key]) {
      errors.push(`${key} is required in production`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Production environment validation failed:\n- ${errors.join('\n- ')}`);
  }
}
