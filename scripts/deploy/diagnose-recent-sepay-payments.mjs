import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.payment.findMany({
    where: { gateway: 'SEPAY' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      paymentReference: true,
      status: true,
      createdAt: true,
      gatewayResponse: true,
    },
  });

  for (const row of rows) {
    const gr =
      row.gatewayResponse && typeof row.gatewayResponse === 'object'
        ? row.gatewayResponse
        : {};
    console.log(
      JSON.stringify({
        id: row.id,
        paymentReference: row.paymentReference,
        status: row.status,
        createdAt: row.createdAt,
        integrationMode: gr.integrationMode ?? null,
        paymentUrl:
          typeof gr.paymentUrl === 'string'
            ? gr.paymentUrl.slice(0, 120)
            : typeof gr.qr_url === 'string'
              ? gr.qr_url.slice(0, 120)
              : null,
        hasCheckoutFormFields: Boolean(gr.checkoutFormFields),
        checkoutUrl: gr.checkoutUrl ?? null,
      }),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
