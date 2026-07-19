/**
 * Re-enqueue topup fulfillment for a stuck PAID order.
 * Usage: docker exec -e ORDER_ID=... cardon-prod-api node /app/scripts/deploy/retry-topup-fulfillment.mjs
 */
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const orderId = process.env.ORDER_ID;

async function main() {
  if (!orderId) {
    console.log(JSON.stringify({ error: 'ORDER_ID required' }));
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      orderItems: { include: { variant: { select: { type: true } } } },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ error: 'ORDER_NOT_FOUND', orderId }));
    return;
  }

  const hasTopup = order.orderItems.some((i) =>
    ['TOPUP', 'DATA'].includes(i.variant.type),
  );
  if (!hasTopup) {
    console.log(JSON.stringify({ error: 'NOT_TOPUP_ORDER', orderCode: order.orderCode }));
    return;
  }

  if (order.paymentStatus !== 'PAID') {
    console.log(JSON.stringify({ error: 'NOT_PAID', order }));
    return;
  }

  const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('topup_queue', { connection });

  const job = await queue.add(
    'fulfill',
    { orderId: order.id, triggeredBy: 'manual-retry', attempt: 1 },
    { jobId: `topup-fulfill-${order.id}-manual-${Date.now()}` },
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        orderCode: order.orderCode,
        fulfillmentStatus: order.fulfillmentStatus,
        jobId: job.id,
      },
      null,
      2,
    ),
  );

  await queue.close();
  await connection.quit();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
