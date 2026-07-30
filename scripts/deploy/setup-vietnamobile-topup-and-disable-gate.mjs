/**
 * Create Vietnamobile topup catalog + disable Gate cards.
 *
 * Pricing:
 *   providerCost = face * (1 - 0.048)  // NCC 4.8%
 *   sellPrice    = face * (1 - 0.02)   // bán CK 2%
 *
 * Usage:
 *   docker exec -w /app cardon-prod-api node /app/scripts/deploy/setup-vietnamobile-topup-and-disable-gate.mjs
 */
import {
  CatalogProductStatus,
  HomeServiceType,
  PrismaClient,
  ProductVariantStatus,
  ProductVariantType,
  ProviderProductAvailability,
  ProviderProductMappingStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

/** Commercial dens aligned with eSale Vietnamobile matrix (skip 5k steps + EXPECTED_FAIL 1005k). */
const VIETNAMOBILE_AMOUNTS = [
  10000, 20000, 50000, 100000, 120000, 150000, 200000, 300000, 500000, 1000000,
];

const NCC_DISCOUNT = 0.048;
const SELL_DISCOUNT = 0.02;

function formatK(amount) {
  if (amount % 1000 === 0) return `${amount / 1000}K`;
  return String(amount);
}

function costOf(face) {
  return Math.round(face * (1 - NCC_DISCOUNT));
}

function sellOf(face) {
  return Math.round(face * (1 - SELL_DISCOUNT));
}

async function main() {
  const provider = await prisma.provider.findFirst({
    where: { code: 'ESALE', deletedAt: null },
  });
  if (!provider) throw new Error('ESALE provider not found');

  const topupCategory = await prisma.productCategory.findFirst({
    where: { slug: 'topup' },
  });
  if (!topupCategory) throw new Error('topup category not found');

  let product = await prisma.product.findFirst({
    where: { slug: 'vietnamobile-topup', deletedAt: null },
  });

  if (!product) {
    const maxSort = await prisma.product.aggregate({
      where: { categoryId: topupCategory.id, deletedAt: null },
      _max: { sortOrder: true },
    });
    product = await prisma.product.create({
      data: {
        slug: 'vietnamobile-topup',
        name: 'Nạp Vietnamobile',
        categoryId: topupCategory.id,
        homeService: HomeServiceType.TOPUP,
        status: CatalogProductStatus.ACTIVE,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    console.log('[ok] created product vietnamobile-topup', product.id);
  } else if (product.status !== CatalogProductStatus.ACTIVE) {
    product = await prisma.product.update({
      where: { id: product.id },
      data: { status: CatalogProductStatus.ACTIVE },
    });
    console.log('[ok] reactivated product vietnamobile-topup');
  } else {
    console.log('[ok] product vietnamobile-topup exists');
  }

  const created = [];
  const mapped = [];

  for (const face of VIETNAMOBILE_AMOUNTS) {
    const sku = `VIETNAMOBILE-TOPUP-${formatK(face)}`;
    const name = `Nạp Vietnamobile ${formatK(face).toLowerCase()}`;
    const sellPrice = sellOf(face);
    const providerCost = costOf(face);
    const providerProductCode = `vietnamobile:${face}`;

    let variant = await prisma.productVariant.findFirst({ where: { sku } });
    if (variant?.deletedAt) {
      variant = await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          deletedAt: null,
          status: ProductVariantStatus.ACTIVE,
          productId: product.id,
          name,
          type: ProductVariantType.TOPUP,
          faceValue: new Decimal(face),
          sellPrice: new Decimal(sellPrice),
          metadata: { telco: 'vietnamobile', nccDiscountPercent: 4.8, sellDiscountPercent: 2 },
        },
      });
      created.push({ action: 'restore', sku });
    } else if (!variant) {
      variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku,
          name,
          type: ProductVariantType.TOPUP,
          faceValue: new Decimal(face),
          sellPrice: new Decimal(sellPrice),
          status: ProductVariantStatus.ACTIVE,
          metadata: { telco: 'vietnamobile', nccDiscountPercent: 4.8, sellDiscountPercent: 2 },
        },
      });
      created.push({ action: 'create', sku, sellPrice, providerCost });
    } else {
      variant = await prisma.productVariant.update({
        where: { id: variant.id },
        data: {
          status: ProductVariantStatus.ACTIVE,
          productId: product.id,
          name,
          type: ProductVariantType.TOPUP,
          faceValue: new Decimal(face),
          sellPrice: new Decimal(sellPrice),
          metadata: { telco: 'vietnamobile', nccDiscountPercent: 4.8, sellDiscountPercent: 2 },
        },
      });
      created.push({ action: 'update', sku, sellPrice, providerCost });
    }

    const existingMap = await prisma.providerProductMapping.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { productVariantId: variant.id },
          { providerProductCode },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existingMap) {
      await prisma.providerProductMapping.update({
        where: { id: existingMap.id },
        data: {
          productVariantId: variant.id,
          providerProductCode,
          providerCost: new Decimal(providerCost),
          status: ProviderProductMappingStatus.ACTIVE,
          availability: ProviderProductAvailability.AVAILABLE,
          priority: 1,
        },
      });
      mapped.push({ action: 'upsert', sku, code: providerProductCode, providerCost });
    } else {
      await prisma.providerProductMapping.create({
        data: {
          providerId: provider.id,
          productVariantId: variant.id,
          providerProductCode,
          providerCost: new Decimal(providerCost),
          priority: 1,
          status: ProviderProductMappingStatus.ACTIVE,
          availability: ProviderProductAvailability.AVAILABLE,
        },
      });
      mapped.push({ action: 'create', sku, code: providerProductCode, providerCost });
    }
  }

  // Reactivate peer TOPUP mappings (card sync previously disabled them incorrectly).
  const reactivatedTopup = await prisma.$executeRaw`
    UPDATE provider_product_mappings pm
    SET status = 'ACTIVE',
        availability = 'AVAILABLE',
        updated_at = NOW()
    FROM product_variants pv, providers p
    WHERE pm.product_variant_id = pv.id
      AND pm.provider_id = p.id
      AND p.code = 'ESALE'
      AND pv.type = 'TOPUP'
      AND (pm.status <> 'ACTIVE' OR pm.availability <> 'AVAILABLE')
  `;

  // Disable Gate card product + variants + mappings.
  const gateProduct = await prisma.product.findFirst({
    where: { slug: 'gate-card', deletedAt: null },
  });
  let gateDisabled = { product: false, variants: 0, mappings: 0 };
  if (gateProduct) {
    await prisma.product.update({
      where: { id: gateProduct.id },
      data: { status: CatalogProductStatus.INACTIVE },
    });
    gateDisabled.product = true;

    const gateVariants = await prisma.productVariant.updateMany({
      where: { productId: gateProduct.id, deletedAt: null },
      data: { status: ProductVariantStatus.INACTIVE },
    });
    gateDisabled.variants = gateVariants.count;

    const gateVariantIds = (
      await prisma.productVariant.findMany({
        where: { productId: gateProduct.id },
        select: { id: true },
      })
    ).map((v) => v.id);

    if (gateVariantIds.length) {
      const gateMaps = await prisma.providerProductMapping.updateMany({
        where: { productVariantId: { in: gateVariantIds } },
        data: {
          status: ProviderProductMappingStatus.INACTIVE,
          availability: ProviderProductAvailability.OUT_OF_STOCK,
        },
      });
      gateDisabled.mappings = gateMaps.count;
    }
  }

  console.log(
    JSON.stringify(
      {
        vietnamobile: { created, mapped },
        reactivatedTopupRows: Number(reactivatedTopup),
        gateDisabled,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
