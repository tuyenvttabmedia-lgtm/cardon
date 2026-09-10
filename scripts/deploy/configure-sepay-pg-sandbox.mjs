/**
 * Configure SePay Payment Gateway sandbox credentials in production DB.
 *
 * Usage on VPS API container:
 *   SEPAY_PG_MERCHANT_ID=SP-TEST-... \
 *   SEPAY_PG_SECRET_KEY=spsk_test_... \
 *   SEPAY_PG_IPN_SECRET=... \
 *   node /app/scripts/deploy/configure-sepay-pg-sandbox.mjs
 */
import { PrismaClient } from '@prisma/client';
import { createCipheriv, createHash, randomBytes } from 'crypto';

const prisma = new PrismaClient();
const SETTINGS_KEY = 'settings.payment.sepay';
const WEBHOOK_URL = 'https://cardon.vn/api/v1/payments/webhook/sepay';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} missing — set it before running this script`);
  }
  return value;
}

function deriveEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY missing');
  return createHash('sha256').update(secret).digest();
}

function encryptField(plaintext) {
  const key = deriveEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

async function main() {
  const merchantId = requireEnv('SEPAY_PG_MERCHANT_ID');
  const secretKey = requireEnv('SEPAY_PG_SECRET_KEY');
  const ipnSecret = requireEnv('SEPAY_PG_IPN_SECRET');

  const row = await prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
  const current =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
      ? row.value
      : {};

  const value = {
    ...current,
    enabled: true,
    environment: 'sandbox',
    integrationMode: 'payment_gateway',
    merchantId,
    paymentMethod: 'BANK_TRANSFER',
    webhookUrl: WEBHOOK_URL,
    secretKeyEnc: encryptField(secretKey),
    webhookSecretEnc: encryptField(ipnSecret),
    apiKeyEnc: undefined,
    bankAccount: undefined,
    bankCode: undefined,
    accountName: undefined,
    qrTemplate: undefined,
  };
  delete value.apiKeyEnc;
  delete value.bankAccount;
  delete value.bankCode;
  delete value.accountName;
  delete value.qrTemplate;

  await prisma.systemSetting.upsert({
    where: { key: SETTINGS_KEY },
    update: { value },
    create: { key: SETTINGS_KEY, value },
  });

  console.log(
    '[configure-sepay-pg-sandbox]',
    JSON.stringify({
      merchantId,
      environment: 'sandbox',
      integrationMode: 'payment_gateway',
      webhookUrl: WEBHOOK_URL,
      ipnSecretConfigured: true,
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
