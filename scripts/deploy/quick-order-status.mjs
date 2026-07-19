import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const code = 'ORD-20260714-3FFD12';
const order = await prisma.order.findFirst({
  where: { orderCode: code },
  include: { providerTransactions: { orderBy: { createdAt: 'desc' }, take: 3 } },
});
console.log(JSON.stringify({
  paymentStatus: order?.paymentStatus,
  fulfillmentStatus: order?.fulfillmentStatus,
  providerTx: order?.providerTransactions.map((t) => ({
    status: t.status,
    requestId: t.requestId,
    lastError: t.lastError,
  })),
}, null, 2));
await prisma.$disconnect();
