import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.webhookLog.findMany({
    where: { source: 'SEPAY' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      source: true,
      processed: true,
      createdAt: true,
      payload: true,
      errorMessage: true,
    },
  });

  console.log(JSON.stringify(rows, null, 2));

  const setting = await prisma.systemSetting.findUnique({
    where: { key: 'settings.payment.sepay' },
  });
  const value = setting?.value;
  console.log(
    'webhookUrlInDb:',
    value && typeof value === 'object' ? value.webhookUrl : null,
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
