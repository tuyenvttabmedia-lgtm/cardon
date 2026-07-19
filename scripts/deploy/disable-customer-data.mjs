import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'system' } });
  const base =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  const next = { ...base, customerDataEnabled: false };
  await prisma.systemSetting.upsert({
    where: { key: 'system' },
    update: { value: next },
    create: { key: 'system', value: next, description: 'System settings' },
  });
  console.log('customerDataEnabled=false');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
