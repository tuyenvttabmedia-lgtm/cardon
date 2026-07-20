import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function loadMegapayNotifyPublicKey(): string | undefined {
  const inline = process.env.MEGAPAY_NOTIFY_PUBLIC_KEY;
  if (inline?.trim()) {
    return inline.replace(/\\n/g, '\n');
  }
  const keyPath =
    process.env.MEGAPAY_NOTIFY_PUBLIC_KEY_PATH ??
    resolve(process.cwd(), 'secrets', 'megapay-notify-public.pem');
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf8');
  }
  // Fallback: PEM mistakenly stored in webhook secret
  const wh = process.env.MEGAPAY_WEBHOOK_SECRET;
  if (wh?.includes('BEGIN PUBLIC KEY')) {
    return wh.replace(/\\n/g, '\n');
  }
  return undefined;
}

export default () => ({
  app: {
    env: process.env.APP_ENV ?? 'development',
    role: process.env.APP_ROLE ?? 'all',
    port: parseInt(process.env.PORT ?? '3000', 10),
    workerHealthPort: parseInt(process.env.WORKER_HEALTH_PORT ?? '3001', 10),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    buildVersion: process.env.BUILD_VERSION ?? '6035.2 AGENT REGISTRATION & KYC CENTER',
    webInternalUrl: process.env.WEB_INTERNAL_URL,
    adminInternalUrl: process.env.ADMIN_INTERNAL_URL,
    corsOrigins: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [],
    workerHeartbeatRequired: process.env.WORKER_HEARTBEAT_REQUIRED === 'true',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY,
  },
  appPublicUrl: process.env.APP_PUBLIC_URL,
  backup: {
    enabled: process.env.BACKUP_ENABLED === 'true',
    dir: process.env.BACKUP_DIR ?? 'backups',
  },
  partnerPublicUrl: process.env.PARTNER_PUBLIC_URL ?? 'http://partner.localhost',
  megapay: {
    merchantId: process.env.MEGAPAY_MERCHANT_ID,
    secretKey: process.env.MEGAPAY_SECRET_KEY,
    endpoint: process.env.MEGAPAY_ENDPOINT,
    returnUrl: process.env.MEGAPAY_RETURN_URL,
    webhookSecret: process.env.MEGAPAY_WEBHOOK_SECRET,
    callbackUrl: process.env.MEGAPAY_CALLBACK_URL,
    bankCode: process.env.MEGAPAY_BANK_CODE ?? 'WOORIBANK',
    notifyPublicKey: loadMegapayNotifyPublicKey(),
  },
  sepay: {
    apiKey: process.env.SEPAY_API_KEY,
    webhookSecret: process.env.SEPAY_WEBHOOK_SECRET,
    bankAccount: process.env.SEPAY_BANK_ACCOUNT,
    bankCode: process.env.SEPAY_BANK_CODE,
    accountName: process.env.SEPAY_ACCOUNT_NAME,
    qrTemplate: process.env.SEPAY_QR_TEMPLATE ?? 'compact',
    merchantId: process.env.SEPAY_MERCHANT_ID ?? process.env.SEPAY_PG_MERCHANT_ID,
    merchantSecretKey:
      process.env.SEPAY_MERCHANT_SECRET_KEY ?? process.env.SEPAY_PG_SECRET_KEY,
    ipnSecretKey: process.env.SEPAY_IPN_SECRET_KEY ?? process.env.SEPAY_PG_IPN_SECRET,
    environment: process.env.SEPAY_ENVIRONMENT ?? process.env.SEPAY_PG_ENVIRONMENT,
  },
  provider: {
    lowBalanceThreshold: parseInt(
      process.env.PROVIDER_LOW_BALANCE_THRESHOLD ?? '500000',
      10,
    ),
  },
  agent: {
    lowBalanceThreshold: parseInt(
      process.env.AGENT_LOW_BALANCE_THRESHOLD ?? '100000',
      10,
    ),
    registrationMode: process.env.AGENT_REGISTRATION_MODE,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM ?? process.env.SMTP_FROM_EMAIL ?? 'noreply@cardon.vn',
    fromName: process.env.SMTP_FROM_NAME,
    secure: process.env.SMTP_SECURE === 'true',
  },
  media: {
    uploadRoot: process.env.MEDIA_UPLOAD_ROOT ?? 'uploads',
    maxBytes: parseInt(process.env.MEDIA_MAX_BYTES ?? String(5 * 1024 * 1024), 10),
    generateWebp: process.env.CMS_MEDIA_GENERATE_WEBP === 'true',
  },
  notification: {
    adminAlertEmail: process.env.ADMIN_ALERT_EMAIL,
  },
  esale: {
    useMock: process.env.ESALE_USE_MOCK === 'true',
    cardApiUrl: process.env.ESALE_API_URL_CARD ?? process.env.ESALE_API_URL,
    topupApiUrl: process.env.ESALE_API_URL_TOPUP,
    agencyCode: process.env.ESALE_AGENCY_CODE ?? process.env.ESALE_PARTNER_ID,
    clientCode: process.env.ESALE_CLIENT_CODE,
    secretKey: process.env.ESALE_SECRET_KEY ?? process.env.ESALE_PARTNER_KEY,
    privateKey: process.env.ESALE_PRIVATE_KEY,
    publicKey: process.env.ESALE_PUBLIC_KEY,
    timeoutMs: parseInt(process.env.ESALE_TIMEOUT_MS ?? '30000', 10),
    defaultCardType: process.env.ESALE_DEFAULT_CARD_TYPE ?? 'Card',
    verifyResponseSignature:
      process.env.ESALE_VERIFY_RESPONSE_SIGNATURE !== 'false',
  },
});
