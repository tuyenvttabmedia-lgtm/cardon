/**
 * Set agentRegistrationMode = PUBLIC_APPROVAL on production VPS.
 * docker exec cardon-prod-api node /app/scripts/deploy/set-public-approval.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const key = 'system';
  const row = await prisma.systemSetting.findUnique({ where: { key } });
  const base =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
      ? row.value
      : {
          siteName: 'CardOn.vn',
          publicUrl: process.env.APP_PUBLIC_URL ?? 'https://cardon.vn',
          customerTopupEnabled: true,
          agentLowBalanceThreshold: 100_000,
          providerLowBalanceThreshold: 500_000,
        };

  await prisma.systemSetting.upsert({
    where: { key },
    update: { value: { ...base, agentRegistrationMode: 'PUBLIC_APPROVAL' } },
    create: {
      key,
      value: { ...base, agentRegistrationMode: 'PUBLIC_APPROVAL' },
      description: 'System configuration',
    },
  });
  console.log('[set-public-approval] agentRegistrationMode = PUBLIC_APPROVAL');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
