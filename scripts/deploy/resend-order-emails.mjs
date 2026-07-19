/**
 * Re-enqueue order notification emails (payment, order confirm, card delivered).
 * Usage: docker exec -e ORDER_CODE=ORD-xxx cardon-prod-api node /app/scripts/deploy/resend-order-emails.mjs
 */
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const orderCode = process.env.ORDER_CODE;

async function main() {
  if (!orderCode) {
    console.log(JSON.stringify({ error: 'ORDER_CODE required' }));
    return;
  }

  const order = await prisma.order.findFirst({
    where: { orderCode, deletedAt: null },
    select: {
      id: true,
      orderCode: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      guestEmail: true,
      user: { select: { email: true } },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ error: 'ORDER_NOT_FOUND', orderCode }));
    return;
  }

  const email = order.user?.email ?? order.guestEmail;
  if (!email) {
    console.log(JSON.stringify({ error: 'NO_RECIPIENT_EMAIL', orderCode }));
    return;
  }

  const redisUrl = process.env.REDIS_URL ?? 'redis://redis:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('notification_queue', { connection });

  const jobs = [];
  const base = {
    channel: 'EMAIL',
    recipientEmail: email,
    recipientType: 'USER',
    payload: { orderId: order.id, orderCode: order.orderCode },
  };

  if (order.paymentStatus === 'PAID') {
    for (const template of ['PAYMENT_SUCCESS', 'ORDER_SUCCESS']) {
      const job = await queue.add(
        'notification.send',
        { ...base, template },
        { jobId: `resend-${order.id}-${template}-${Date.now()}` },
      );
      jobs.push({ template, jobId: job.id });
    }
  }

  if (order.fulfillmentStatus === 'COMPLETED') {
    const job = await queue.add(
      'notification.send',
      { ...base, template: 'CARD_DELIVERED' },
      { jobId: `resend-${order.id}-CARD_DELIVERED-${Date.now()}` },
    );
    jobs.push({ template: 'CARD_DELIVERED', jobId: job.id });
  }

  console.log(JSON.stringify({ ok: true, orderCode, email, jobs }, null, 2));

  await queue.close();
  await connection.quit();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
