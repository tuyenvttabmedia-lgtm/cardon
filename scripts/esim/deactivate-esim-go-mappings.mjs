/**
 * Localhost-only helper: deactivate eSIM Go mappings and mark provider INACTIVE.
 * Does not delete historical orders or install secrets already delivered.
 *
 * Usage (local stack):
 *   node scripts/esim/deactivate-esim-go-mappings.mjs
 *   # or inside API container with DATABASE_URL set
 */

import { PrismaClient, ProviderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const provider = await prisma.provider.findUnique({ where: { code: 'ESIM_GO' } });
  if (!provider) {
    console.log('No ESIM_GO provider row — nothing to do');
    return;
  }

  const deactivated = await prisma.providerProductMapping.updateMany({
    where: { providerId: provider.id, status: 'ACTIVE' },
    data: { status: 'INACTIVE', availability: 'OUT_OF_STOCK' },
  });

  await prisma.provider.update({
    where: { id: provider.id },
    data: { status: ProviderStatus.INACTIVE },
  });

  console.log(
    JSON.stringify(
      {
        providerId: provider.id,
        mappingsDeactivated: deactivated.count,
        providerStatus: 'INACTIVE',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
