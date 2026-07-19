/**
 * Replay SePay PG IPN for a pending payment (sandbox recovery).
 * Usage:
 *   PAYMENT_REF=PAY-7533FE0EAEBB4EF09630 AMOUNT=20300 \
 *   docker exec -e PAYMENT_REF -e AMOUNT cardon-prod-api node /app/scripts/deploy/replay-sepay-ipn.mjs
 */
import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const paymentRef = process.env.PAYMENT_REF;
const amount = process.env.AMOUNT ?? '20300';
const webhookUrl =
  process.env.WEBHOOK_URL ?? 'http://127.0.0.1:3000/api/v1/payments/webhook/sepay';

function decrypt(payload) {
  const secret = process.env.ENCRYPTION_KEY;
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
  if (!paymentRef) throw new Error('PAYMENT_REF required');

  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const ipnSecret = decrypt(stored.webhookSecretEnc);

  const body = {
    notification_type: 'ORDER_PAID',
    order: {
      order_invoice_number: paymentRef,
      order_amount: `${Number(amount).toFixed(2)}`,
    },
    transaction: {
      transaction_id: `sandbox-replay-${Date.now()}`,
      transaction_status: 'APPROVED',
      transaction_amount: `${Number(amount).toFixed(2)}`,
    },
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Secret-Key': ipnSecret,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(JSON.stringify({ status: res.status, body: text.slice(0, 500) }));

  const payment = await prisma.payment.findFirst({
    where: { paymentReference: paymentRef },
    include: { order: true },
  });
  if (payment) {
    console.log(
      JSON.stringify({
        paymentStatus: payment.status,
        orderPaymentStatus: payment.order.paymentStatus,
        orderFulfillmentStatus: payment.order.fulfillmentStatus,
        paidAt: payment.paidAt,
      }),
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
