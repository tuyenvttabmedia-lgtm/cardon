import { assertProductionEnv, isUnsafeSecret } from './production-env.rules';

describe('Production environment rules', () => {
  it('rejects unsafe JWT/ENCRYPTION placeholders', () => {
    expect(isUnsafeSecret('change-me-to-a-secure-random-string-min-32-chars')).toBe(true);
    expect(isUnsafeSecret('01234567890123456789012345678901')).toBe(true);
    expect(isUnsafeSecret('a'.repeat(64))).toBe(false);
  });

  it('requires payment, provider, SMTP keys in production', () => {
    expect(() =>
      assertProductionEnv({
        APP_ENV: 'production',
        JWT_SECRET: 'x'.repeat(64),
        ENCRYPTION_KEY: 'y'.repeat(64),
      }),
    ).toThrow(/Production environment validation failed/);
  });

  it('passes when production env is fully configured', () => {
    expect(() =>
      assertProductionEnv({
        APP_ENV: 'production',
        JWT_SECRET: 'x'.repeat(64),
        ENCRYPTION_KEY: 'y'.repeat(64),
        APP_PUBLIC_URL: 'https://cardon.vn',
        CORS_ORIGINS: 'https://cardon.vn',
        SMTP_HOST: 'smtp.example.com',
        SMTP_USER: 'noreply@cardon.vn',
        SMTP_PASS: 'secret',
        ADMIN_ALERT_EMAIL: 'ops@cardon.vn',
        MEGAPAY_MERCHANT_ID: 'm1',
        MEGAPAY_SECRET_KEY: 'mk',
        MEGAPAY_ENDPOINT: 'https://pay.example.com',
        MEGAPAY_WEBHOOK_SECRET: 'wh',
        SEPAY_API_KEY: 'sk',
        SEPAY_WEBHOOK_SECRET: 'swh',
        SEPAY_BANK_ACCOUNT: '123',
        ESALE_API_URL_CARD: 'https://esale.example.com/card',
        ESALE_AGENCY_CODE: '901',
        ESALE_SECRET_KEY: 'esk',
        ESALE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
        ESALE_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----',
      }),
    ).not.toThrow();
  });
});
