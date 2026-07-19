/**
 * Smoke-test SePay config resolution inside the API container.
 * Usage: docker exec cardon-prod-api node /app/scripts/deploy/test-sepay-resolve.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function main() {
  // Bootstrap minimal Nest context is heavy; read DB + mimic resolveSepayConfig instead.
  const { PrismaClient } = require('@prisma/client');
  const crypto = require('crypto');

  const prisma = new PrismaClient();
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};

  const encKey = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!encKey) {
    console.log(JSON.stringify({ error: 'SETTINGS_ENCRYPTION_KEY missing' }));
    process.exit(1);
  }

  function decrypt(enc) {
    const [ivB64, tagB64, dataB64] = enc.split(':');
    const key = Buffer.from(encKey, 'hex');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  const explicitMode = stored.integrationMode;
  const merchantId = stored.merchantId ?? process.env.SEPAY_MERCHANT_ID;
  const merchantSecretKey = stored.secretKeyEnc
    ? decrypt(stored.secretKeyEnc)
    : process.env.SEPAY_MERCHANT_SECRET_KEY;
  const ipnSecretKey = stored.webhookSecretEnc
    ? decrypt(stored.webhookSecretEnc)
    : process.env.SEPAY_IPN_SECRET_KEY ?? process.env.SEPAY_WEBHOOK_SECRET;

  const integrationMode =
    explicitMode ??
    (merchantId && merchantSecretKey ? 'payment_gateway' : 'legacy_qr');

  const result = {
    integrationMode,
    merchantId: merchantId ?? null,
    merchantSecretOk: Boolean(merchantSecretKey),
    ipnSecretOk: Boolean(ipnSecretKey),
    envLegacyBank: process.env.SEPAY_BANK_ACCOUNT ?? null,
    wouldUsePg: integrationMode === 'payment_gateway',
  };

  if (integrationMode === 'payment_gateway') {
    result.checkoutUrl =
      stored.environment === 'sandbox' ||
      process.env.SEPAY_ENVIRONMENT === 'sandbox'
        ? 'https://pay-sandbox.sepay.vn/v1/checkout/init'
        : 'https://pay.sepay.vn/v1/checkout/init';
  } else {
    result.legacyQrAccount = process.env.SEPAY_BANK_ACCOUNT ?? stored.bankAccount;
  }

  console.log(JSON.stringify(result, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
