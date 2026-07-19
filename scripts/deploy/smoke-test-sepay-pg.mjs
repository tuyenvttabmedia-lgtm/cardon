/**
 * Smoke test: resolve SePay PG config from DB and build checkout URL.
 * Usage: docker exec cardon-prod-api node /app/scripts/deploy/smoke-test-sepay-pg.mjs
 */
import { createDecipheriv, createHash } from 'crypto';
import { createRequire } from 'module';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
const { buildSepayPgCheckoutFields, getSepayPgCheckoutUrl } = require(
  '/app/dist/modules/payment/providers/sepay/sepay.pg.js',
);

const prisma = new PrismaClient();

function decrypt(payload) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY missing');
  const key = createHash('sha256').update(secret).digest();
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function main() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  const stored =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
      ? row.value
      : {};

  const integrationMode =
    stored.integrationMode ??
    (stored.merchantId && stored.secretKeyEnc ? 'payment_gateway' : 'legacy_qr');

  if (integrationMode !== 'payment_gateway') {
    console.log(JSON.stringify({ ok: false, reason: 'not_payment_gateway', integrationMode }));
    return;
  }

  const merchantSecretKey = decrypt(stored.secretKeyEnc);
  const ipnSecretKey = decrypt(stored.webhookSecretEnc);
  const checkoutUrl = getSepayPgCheckoutUrl('sandbox');
  const fields = buildSepayPgCheckoutFields({
    merchantId: stored.merchantId,
    merchantSecretKey,
    environment: 'sandbox',
    paymentMethod: stored.paymentMethod ?? 'BANK_TRANSFER',
    orderInvoiceNumber: 'PAY-SMOKE-TEST',
    orderAmount: 10000,
    orderDescription: 'CardOn smoke test',
    successUrl: 'https://cardon.vn/orders/smoke?payment=success',
    errorUrl: 'https://cardon.vn/orders/smoke?payment=error',
    cancelUrl: 'https://cardon.vn/orders/smoke?payment=cancel',
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        integrationMode,
        merchantId: stored.merchantId,
        checkoutUrl,
        ipnSecretConfigured: Boolean(ipnSecretKey),
        signaturePresent: Boolean(fields.signature),
        sampleFieldCount: Object.keys(fields).length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
