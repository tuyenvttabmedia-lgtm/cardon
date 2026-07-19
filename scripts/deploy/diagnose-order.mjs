import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ORDER_CODE = process.env.ORDER_CODE ?? 'ORD-20260714-80C0A4';

async function main() {
  const order = await prisma.order.findFirst({
    where: { orderCode: ORDER_CODE, deletedAt: null },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      orderEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ error: 'ORDER_NOT_FOUND', orderCode: ORDER_CODE }));
    return;
  }

  const payments = order.payments.map((p) => {
    const gr =
      p.gatewayResponse && typeof p.gatewayResponse === 'object'
        ? p.gatewayResponse
        : {};
    return {
      id: p.id,
      paymentReference: p.paymentReference,
      gateway: p.gateway,
      status: p.status,
      amount: String(p.amount),
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      integrationMode: gr.integrationMode ?? null,
      paymentUrl:
        typeof gr.paymentUrl === 'string' ? gr.paymentUrl.slice(0, 100) : null,
      checkoutUrl: gr.checkoutUrl ?? null,
      hasCheckoutFormFields: Boolean(gr.checkoutFormFields),
      gatewayTransactionId: gr.gatewayTransactionId ?? null,
    };
  });

  const webhooks = [];

  console.log(
    JSON.stringify(
      {
        order: {
          id: order.id,
          orderCode: order.orderCode,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          totalAmount: String(order.totalAmount),
          paymentMethodCode: order.paymentMethodCode,
          createdAt: order.createdAt,
          paymentExpiresAt: order.paymentExpiresAt,
          paymentId: order.paymentId,
        },
        payments,
        orderEvents: order.orderEvents.map((e) => ({
          id: e.id,
          eventType: e.eventType,
          createdAt: e.createdAt,
          payload: JSON.stringify(e.payload).slice(0, 200),
        })),
        recentSepayWebhooks: webhooks,
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
