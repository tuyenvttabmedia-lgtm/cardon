import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ref = process.env.PAYMENT_REF ?? 'PAY-7533FE0EAEBB4EF09630';

async function main() {
  const p = await prisma.payment.findFirst({ where: { paymentReference: ref } });
  console.log(JSON.stringify(p?.gatewayResponse, null, 2));
}

main().finally(() => prisma.$disconnect());
