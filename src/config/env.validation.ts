import * as Joi from 'joi';
import { assertProductionEnv } from './production-env.rules';

export const envValidationSchema = Joi.object({
  APP_ENV: Joi.string()
    .valid('development', 'staging', 'production', 'test')
    .default('development'),
  APP_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),
  PORT: Joi.number().port().default(3000),
  WORKER_HEALTH_PORT: Joi.number().port().optional(),
  API_PREFIX: Joi.string().default('api/v1'),
  DATABASE_URL: Joi.string().uri({ scheme: ['postgresql', 'postgres'] }).required(),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  ENCRYPTION_KEY: Joi.string().min(32).required(),
  APP_PUBLIC_URL: Joi.string().uri().optional(),
  CORS_ORIGINS: Joi.string().optional(),
  WORKER_HEARTBEAT_REQUIRED: Joi.boolean().truthy('true').falsy('false').optional(),
  MEGAPAY_MERCHANT_ID: Joi.string().optional(),
  MEGAPAY_SECRET_KEY: Joi.string().optional(),
  MEGAPAY_ENDPOINT: Joi.string().uri().optional(),
  MEGAPAY_RETURN_URL: Joi.string().uri().optional(),
  MEGAPAY_WEBHOOK_SECRET: Joi.string().optional(),
  MEGAPAY_CALLBACK_URL: Joi.string().uri().optional(),
  SEPAY_API_KEY: Joi.string().optional(),
  SEPAY_WEBHOOK_SECRET: Joi.string().optional(),
  SEPAY_BANK_ACCOUNT: Joi.string().optional(),
  SEPAY_BANK_CODE: Joi.string().optional(),
  SEPAY_ACCOUNT_NAME: Joi.string().optional(),
  SEPAY_QR_TEMPLATE: Joi.string().valid('compact', 'qronly', 'standee', '').optional(),
  ESALE_USE_MOCK: Joi.boolean().truthy('true').falsy('false').optional(),
  ESALE_API_URL_CARD: Joi.string().uri().optional(),
  ESALE_API_URL: Joi.string().uri().optional(),
  ESALE_API_URL_TOPUP: Joi.string().uri().optional(),
  ESALE_AGENCY_CODE: Joi.string().optional(),
  ESALE_PARTNER_ID: Joi.string().optional(),
  ESALE_CLIENT_CODE: Joi.string().optional(),
  ESALE_SECRET_KEY: Joi.string().optional(),
  ESALE_PARTNER_KEY: Joi.string().optional(),
  ESALE_PRIVATE_KEY: Joi.string().optional(),
  ESALE_PUBLIC_KEY: Joi.string().optional(),
  ESALE_TIMEOUT_MS: Joi.number().integer().min(1000).optional(),
  ESALE_DEFAULT_CARD_TYPE: Joi.string()
    .valid('Card', 'Game', 'Card3G')
    .optional(),
  ESALE_VERIFY_RESPONSE_SIGNATURE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .optional(),
  PROVIDER_LOW_BALANCE_THRESHOLD: Joi.number().integer().min(0).optional(),
  AGENT_LOW_BALANCE_THRESHOLD: Joi.number().integer().min(0).optional(),
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().integer().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  SMTP_PASSWORD: Joi.string().optional(),
  SMTP_FROM: Joi.string().email().optional(),
  SMTP_FROM_EMAIL: Joi.string().email().optional(),
  SMTP_FROM_NAME: Joi.string().optional(),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').optional(),
  MEDIA_UPLOAD_ROOT: Joi.string().optional(),
  MEDIA_MAX_BYTES: Joi.number().integer().min(1024).optional(),
  CMS_MEDIA_GENERATE_WEBP: Joi.boolean().truthy('true').falsy('false').optional(),
  ADMIN_ALERT_EMAIL: Joi.string().email().optional(),
}).custom((env, helpers) => {
  try {
    assertProductionEnv(env as Record<string, unknown>);
    return env;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid production environment';
    return helpers.error('any.custom', { message });
  }
});
