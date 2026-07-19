import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const orderId = process.env.ORDER_ID ?? '747fe1aa-7a60-4307-a2cd-8e01bc38f7e1';

async function main() {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      payments: true,
      providerTransactions: { orderBy: { createdAt: 'desc' }, take: 3 },
      orderItems: { include: { cardDeliveries: true } },
    },
  });
  console.log(JSON.stringify({
    orderCode: order?.orderCode,
    paymentStatus: order?.paymentStatus,
    fulfillmentStatus: order?.fulfillmentStatus,
    providerTx: order?.providerTransactions.map((t) => ({
      status: t.status,
      requestId: t.requestId,
      retCode: t.responsePayload && typeof t.responsePayload === 'object'
        ? t.responsePayload.retCode
        : null,
      lastError: t.lastError,
    })),
    cards: order?.orderItems.flatMap((i) => i.cardDeliveries?.length ?? 0),
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
