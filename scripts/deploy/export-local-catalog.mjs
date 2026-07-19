/**
 * Export product catalog from local Postgres for production import.
 *
 * Usage (local full stack):
 *   docker exec cardon-local-full-api node /app/scripts/deploy/export-local-catalog.mjs
 *   docker cp cardon-local-full-api:/tmp/catalog-export.json ./catalog-export.json
 */
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();
const OUT = process.env.CATALOG_EXPORT_PATH ?? '/tmp/catalog-export.json';

async function main() {
  const categories = await prisma.productCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const variants = await prisma.productVariant.findMany({
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'asc' }],
  });
  const mappings = await prisma.providerProductMapping.findMany({
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    categories,
    products,
    variants,
    mappings,
    stats: {
      categories: categories.length,
      products: products.length,
      variants: variants.length,
      mappings: mappings.length,
    },
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
  console.log('[export-local-catalog]', JSON.stringify(payload.stats), '->', OUT);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
