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

  it('rejects live eSIM arm without Airalo credentials and PayPal eSIM while checkout is stubbed', () => {
    const base = {
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
    };

    expect(() =>
      assertProductionEnv({
        ...base,
        ESIM_ENABLED: 'true',
        ESIM_PROVIDER_MODE: 'live',
        ESIM_LIVE_ARM: 'true',
      }),
    ).toThrow(/AIRALO_CLIENT_ID/);

    expect(() =>
      assertProductionEnv({
        ...base,
        PAYPAL_ESIM_ENABLED: 'true',
      }),
    ).toThrow(/PAYPAL_ESIM_ENABLED/);

    expect(() =>
      assertProductionEnv({
        ...base,
        ESIM_ENABLED: 'false',
        ESIM_PROVIDER_MODE: 'mock',
        ESIM_LIVE_ARM: 'false',
        PAYPAL_ESIM_ENABLED: 'false',
      }),
    ).not.toThrow();

    expect(() =>
      assertProductionEnv({
        ...base,
        PAYPAL_ESIM_ENABLED: 'false',
        PAYPAL_MODE: 'live',
      }),
    ).toThrow(/PAYPAL_MODE=live requires/);
  });
});
