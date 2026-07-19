/**
 * Re-enqueue fulfillment for a stuck PAID order.
 * Usage: docker exec -e ORDER_ID=... cardon-prod-api node /app/scripts/deploy/retry-order-fulfillment.mjs
 */
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const orderId = process.env.ORDER_ID ?? '747fe1aa-7a60-4307-a2cd-8e01bc38f7e1';

async function main() {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderCode: true,
      paymentStatus: true,
      fulfillmentStatus: true,
    },
  });

  if (!order) {
    console.log(JSON.stringify({ error: 'ORDER_NOT_FOUND', orderId }));
    return;
  }

  if (order.paymentStatus !== 'PAID') {
    console.log(JSON.stringify({ error: 'NOT_PAID', order }));
    return;
  }

  const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('provider_queue', { connection });

  const job = await queue.add(
    'fulfill',
    { orderId: order.id, triggeredBy: 'manual-retry' },
    { jobId: `fulfill-${order.id}-manual-${Date.now()}` },
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
