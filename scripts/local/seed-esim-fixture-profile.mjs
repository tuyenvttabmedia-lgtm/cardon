/**
 * Localhost UX fixture: attach a sandbox LPA to a paid eSIM order
 * so /tai-khoan/esim and order delivery can be audited without Airalo GET.
 *
 *   docker cp scripts/local/seed-esim-fixture-profile.mjs cardon-local-full-api:/tmp/seed-esim-fixture.mjs
 *   docker exec -w /app -e NODE_PATH=/app/node_modules cardon-local-full-api node /tmp/seed-esim-fixture.mjs
 */
import { createCipheriv, createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const TEST_LPA = 'LPA:1$lpa.airalo.com$TEST';
const prisma = new PrismaClient();

function encrypt(plaintext) {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY is not configured');
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

async function main() {
  const preferred = process.env.ESIM_FIXTURE_ORDER_CODE || 'ORD-20261024-D80714';
  const order =
    (await prisma.order.findFirst({
      where: { orderCode: preferred, deletedAt: null },
      include: {
        orderItems: {
          include: { variant: true, esimProfile: true, esimAttempts: true, esimQuote: true },
        },
        user: { select: { email: true } },
      },
    })) ||
    (await prisma.order.findFirst({
      where: {
        deletedAt: null,
        paymentStatus: 'PAID',
        orderItems: { some: { variant: { type: 'ESIM' } } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        orderItems: {
          include: { variant: true, esimProfile: true, esimAttempts: true, esimQuote: true },
        },
        user: { select: { email: true } },
      },
    }));

  if (!order) {
    throw new Error('No paid eSIM order found to attach a fixture LPA');
  }
  const item = order.orderItems.find((row) => row.variant?.type === 'ESIM') ?? order.orderItems[0];
  if (!item) throw new Error(`Order ${order.orderCode} has no items`);
  if (item.esimProfile) {
    console.log(
      JSON.stringify({
        skipped: true,
        orderCode: order.orderCode,
        orderId: order.id,
        email: order.user?.email ?? order.guestEmail,
        reason: 'profile already present',
      }),
    );
    return;
  }

  const createAttempt =
    item.esimAttempts.find((row) => row.operation === 'CREATE') ?? item.esimAttempts[0];
  if (!createAttempt) {
    throw new Error(`Order ${order.orderCode} has no Airalo CREATE attempt to attach a profile`);
  }

  const installSecretEnc = encrypt(TEST_LPA);
  await prisma.$transaction(async (tx) => {
    await tx.esimProfile.create({
      data: {
        orderItemId: item.id,
        attemptId: createAttempt.id,
        installSecretEnc,
      },
    });
    await tx.esimProviderAttempt.update({
      where: { id: createAttempt.id },
      data: {
        outcome: 'PROFILE_SAVED',
        openGuard: null,
        completedAt: new Date(),
        errorCode: null,
        errorMessage: 'localhost fixture LPA (Airalo sandbox TEST)',
        safeResponseMeta: { fixture: true, hasInstallSecret: true },
      },
    });
    await tx.order.update({
      where: { id: order.id },
      data: { fulfillmentStatus: 'COMPLETED' },
    });
  });

  console.log(
    JSON.stringify({
      seeded: true,
      orderCode: order.orderCode,
      orderId: order.id,
      email: order.user?.email ?? order.guestEmail,
      lpa: 'LPA:1$lpa.airalo.com$TEST',
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
