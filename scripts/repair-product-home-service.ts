/**
 * Phase 6O30.3 — Repair product/category homepage service mapping.
 * Ensures root categories exist, assigns parentId for orphan categories,
 * and moves CARD products in mixed legacy categories to the correct service root.
 *
 * Usage:
 *   docker exec cardon-local-full-api node --experimental-strip-types /app/scripts/repair-product-home-service.ts
 */
import { PrismaClient, HomeServiceType, ProductVariantType } from '@prisma/client';

const prisma = new PrismaClient();

const HOME_SERVICE_ROOTS: Record<HomeServiceType, { slug: string; name: string; sortOrder: number }> = {
  GAME_CARD: { slug: 'game-card', name: 'Thẻ game', sortOrder: 0 },
  PHONE_CARD: { slug: 'phone-card', name: 'Thẻ điện thoại', sortOrder: 1 },
  TOPUP: { slug: 'topup', name: 'Nạp cước', sortOrder: 2 },
  DATA: { slug: 'data', name: 'Nạp Data', sortOrder: 3 },
};

const LEGACY_CATEGORY_SLUG_HINTS: Array<{ pattern: RegExp; service: HomeServiceType }> = [
  { pattern: /phone-card|the-.*thoai|dien-thoai|telco|^phone/, service: 'PHONE_CARD' },
  { pattern: /game-card|game-cards|local-demo-cards|smoke-game-cards|game-cards-local/, service: 'GAME_CARD' },
  { pattern: /(^topup$|nap-cuoc|local-demo-topup)/, service: 'TOPUP' },
  { pattern: /(^data$|nap-data)/, service: 'DATA' },
];

/** Telco provider codes from integration mappings — not display names. */
const TELCO_PROVIDER_CODE = /^(VIETTEL|MOBIFONE|MOBIPHONE|VINAPHONE|VIETNAMOBILE|VINA)/i;

function inferServiceFromCategorySlug(slug: string): HomeServiceType | null {
  const normalized = slug.toLowerCase();
  for (const root of Object.values(HOME_SERVICE_ROOTS)) {
    if (normalized === root.slug) return null;
  }
  for (const hint of LEGACY_CATEGORY_SLUG_HINTS) {
    if (hint.pattern.test(normalized)) return hint.service;
  }
  return null;
}

function resolveHomeService(
  categoryId: string,
  byId: Map<string, { id: string; slug: string; parentId: string | null }>,
): HomeServiceType | null {
  const visited = new Set<string>();
  let current = byId.get(categoryId);
  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);
    for (const [service, root] of Object.entries(HOME_SERVICE_ROOTS)) {
      if (current.slug === root.slug) return service as HomeServiceType;
    }
    if (!current.parentId) {
      return inferServiceFromCategorySlug(current.slug);
    }
    current = byId.get(current.parentId);
  }
  return null;
}

async function ensureRootCategories() {
  const roots: Record<HomeServiceType, string> = {} as Record<HomeServiceType, string>;
  for (const [service, meta] of Object.entries(HOME_SERVICE_ROOTS)) {
    const row = await prisma.productCategory.upsert({
      where: { slug: meta.slug },
      update: { name: meta.name, status: 'ACTIVE', sortOrder: meta.sortOrder, homeService: service },
      create: {
        slug: meta.slug,
        name: meta.name,
        status: 'ACTIVE',
        sortOrder: meta.sortOrder,
        homeService: service,
      },
    });
    roots[service as HomeServiceType] = row.id;
  }
  return roots;
}

async function repairCategories(roots: Record<HomeServiceType, string>) {
  const categories = await prisma.productCategory.findMany();
  const byId = new Map(categories.map((c) => [c.id, c]));
  let fixed = 0;

  for (const category of categories) {
    const isRoot = Object.values(HOME_SERVICE_ROOTS).some((r) => r.slug === category.slug);
    if (isRoot) continue;

    const resolved = resolveHomeService(category.id, byId);
    if (resolved) continue;

    const inferred = inferServiceFromCategorySlug(category.slug);
    if (!inferred) {
      console.warn(`[skip] category "${category.slug}" — cannot infer homepage service`);
      continue;
    }

    await prisma.productCategory.update({
      where: { id: category.id },
      data: { parentId: roots[inferred] },
    });
    byId.set(category.id, { ...category, parentId: roots[inferred] });
    console.log(`[category] ${category.slug} → parent ${HOME_SERVICE_ROOTS[inferred].slug}`);
    fixed += 1;
  }

  return fixed;
}

async function inferCardServiceFromProvider(productId: string): Promise<HomeServiceType> {
  const mapping = await prisma.providerProductMapping.findFirst({
    where: { productVariant: { productId, deletedAt: null } },
    orderBy: { priority: 'asc' },
    select: { providerProductCode: true },
  });
  if (mapping && TELCO_PROVIDER_CODE.test(mapping.providerProductCode)) {
    return 'PHONE_CARD';
  }
  return 'GAME_CARD';
}

async function repairMixedCardProducts(roots: Record<HomeServiceType, string>) {
  const categories = await prisma.productCategory.findMany();
  const byId = new Map(categories.map((c) => [c.id, c]));

  const mixedSlugs = new Set(['local-demo-cards', 'smoke-game-cards', 'game-cards-local']);
  const mixedCategories = categories.filter((c) => mixedSlugs.has(c.slug));
  let moved = 0;

  for (const mixed of mixedCategories) {
    const products = await prisma.product.findMany({
      where: { categoryId: mixed.id, deletedAt: null },
      include: {
        variants: { where: { deletedAt: null }, select: { type: true } },
      },
    });

    for (const product of products) {
      const variantTypes = new Set(product.variants.map((v) => v.type));
      if (variantTypes.has(ProductVariantType.TOPUP)) continue;
      if (variantTypes.has(ProductVariantType.DATA)) continue;
      if (!variantTypes.has(ProductVariantType.CARD)) continue;

      const targetService = await inferCardServiceFromProvider(product.id);
      const targetRootId = roots[targetService];

      if (product.categoryId !== targetRootId) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId: targetRootId, homeService: targetService },
        });
        console.log(`[product] ${product.slug} → category ${HOME_SERVICE_ROOTS[targetService].slug}`);
        moved += 1;
      }
    }
  }

  return moved;
}

async function main() {
  console.log('Phase 6O30.3 — Repair product homepage service mapping');
  const roots = await ensureRootCategories();
  const categoriesFixed = await repairCategories(roots);
  const productsMoved = await repairMixedCardProducts(roots);
  console.log(`Done. Categories reparented: ${categoriesFixed}, products moved: ${productsMoved}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
