import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [categories, products, variants, mappings] = await Promise.all([
    prisma.productCategory.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.providerProductMapping.count(),
  ]);
  const samples = await prisma.providerProductMapping.findMany({
    take: 6,
    include: { productVariant: { select: { sku: true, type: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify({ categories, products, variants, mappings }, null, 2));
  for (const row of samples) {
    console.log(`${row.productVariant.type}\t${row.productVariant.sku}\t${row.providerProductCode}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
