import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ref = process.env.PAYMENT_REF ?? 'PAY-18A41AA59F284A419E29';

async function main() {
  const payment = await prisma.payment.findFirst({
    where: { paymentReference: ref },
    include: { order: true },
  });
  console.log('PAYMENT', JSON.stringify({
    status: payment?.status,
    paidAt: payment?.paidAt,
    orderPaymentStatus: payment?.order?.paymentStatus,
    orderFulfillment: payment?.order?.fulfillmentStatus,
    gatewayResponse: payment?.gatewayResponse,
  }, null, 2));

  const webhooks = await prisma.webhookLog.findMany({
    where: {
      OR: [
        { paymentReference: ref },
        { payload: { path: ['order', 'order_invoice_number'], equals: ref } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log('WEBHOOKS', JSON.stringify(webhooks, null, 2));
}

main().finally(() => prisma.$disconnect());
