/**
 * Create CardOn products/variants + eSale mappings for missing Card/Game catalog items.
 * Skips Card3G / DATA / TOPUP (eSale has no data/topup card API for those).
 *
 * Usage:
 *   docker exec -w /app cardon-prod-api node /app/scripts/deploy/map-missing-esale-cards.mjs
 *   docker exec -w /app cardon-prod-api node /app/scripts/deploy/map-missing-esale-cards.mjs --dry-run
 */
import { createDecipheriv, createHash, randomUUID } from 'crypto';
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
const ESALE_SETTINGS_KEY = 'settings.provider.esale';
const DRY_RUN = process.argv.includes('--dry-run');

/** supplierCode -> product slug on CardOn */
const SUPPLIER_PRODUCT = {
  MOBIFONE: { slug: 'mobifone', name: 'Mobifone', categorySlug: 'phone-card', homeService: HomeServiceType.PHONE_CARD },
  VIETTEL: { slug: 'viettel-card', name: 'Viettel Card', categorySlug: 'phone-card', homeService: HomeServiceType.PHONE_CARD },
  VINAPHONE: { slug: 'vinaphone', name: 'Vinaphone', categorySlug: 'phone-card', homeService: HomeServiceType.PHONE_CARD },
  VIETNAMOBILE: {
    slug: 'vietnamobile',
    name: 'Vietnamobile',
    categorySlug: 'phone-card',
    homeService: HomeServiceType.PHONE_CARD,
  },
  APPOTA: { slug: 'appota-card', name: 'Appota Card', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
  GARENA: { slug: 'garena-card', name: 'Garena Card', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
  GOSU: { slug: 'gosu-card', name: 'Gosu Card', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
  ZING: { slug: 'zing-card', name: 'Zing Card', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
  FUNCARD: { slug: 'funcard', name: 'Funcard', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
  GATE: { slug: 'gate-card', name: 'Gate Card', categorySlug: 'game-card', homeService: HomeServiceType.GAME_CARD },
};

const SKU_PREFIX = {
  MOBIFONE: 'MOBIFONE',
  VIETTEL: 'VIETTEL',
  VINAPHONE: 'VINAPHONE',
  VIETNAMOBILE: 'VIETNAMOBILE',
  APPOTA: 'APPOTA',
  GARENA: 'GARENA',
  GOSU: 'GOSU',
  ZING: 'ZING',
  FUNCARD: 'FUNCARD',
  GATE: 'GATE',
};

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deriveEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY is not configured');
  return createHash('sha256').update(secret).digest();
}

function decryptSettingField(payload) {
  if (!payload) return undefined;
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const key = deriveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function resolveEsaleConfig() {
  const row = await prisma.systemSetting.findUnique({ where: { key: ESALE_SETTINGS_KEY } });
  const stored =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};
  const cardApiUrl =
    stored.cardApiUrl ?? process.env.ESALE_API_URL_CARD ?? process.env.ESALE_API_URL;
  const agencyCode =
    stored.agencyCode ?? process.env.ESALE_AGENCY_CODE ?? process.env.ESALE_PARTNER_ID;
  const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
  const secretKey =
    (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
    process.env.ESALE_SECRET_KEY ??
    process.env.ESALE_PARTNER_KEY;
  if (!cardApiUrl || !agencyCode || !clientCode || !secretKey) {
    throw new Error('eSale is not configured');
  }
  return {
    cardApiUrl: `${cardApiUrl.replace(/\/$/, '')}/`,
    agencyCode,
    clientCode,
    secretKey,
  };
}

async function fetchEsaleCardAndGameCatalog(config) {
  const items = [];
  for (const cardType of ['Card', 'Game']) {
    const time = Math.floor(Date.now() / 1000).toString();
    const sig = sha256Hex(`${config.agencyCode}|${time}|${config.secretKey}`);
    const response = await fetch(`${config.cardApiUrl}getcardlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agencyCode: config.agencyCode,
        clientCode: config.clientCode,
        cardType,
        time,
        sig,
      }),
    });
    const payload = await response.json();
    if (payload.retCode !== 1 || !payload.data?.info?.length) {
      console.warn(`[map-missing] getcardlist ${cardType} retCode=${payload.retCode}`);
      continue;
    }
    for (const item of payload.data.info) {
      const supplierCode = String(item.supplierCode).toUpperCase();
      if (supplierCode.endsWith('3G')) continue;
      items.push({
        supplierCode,
        cardId: Number(item.cardId),
        cardName: item.cardName,
        faceValue: Number(item.unitPrice),
        providerCost: Number(item.priceDiscount),
        cardType,
        code: `${supplierCode}:${item.cardId}`,
      });
    }
  }
  return items;
}

function formatFaceLabel(faceValue) {
  const n = Math.round(Number(faceValue));
  if (n % 1000 === 0) return `${n / 1000}k`;
  return String(n);
}

function buildSku(supplierCode, faceValue) {
  const prefix = SKU_PREFIX[supplierCode] ?? supplierCode;
  const n = Math.round(Number(faceValue));
  if (n % 1000 === 0) return `${prefix}_${n / 1000}K`;
  return `${prefix}_${n}`;
}

function buildVariantName(productName, faceValue) {
  const brand = productName.replace(/\s+Card$/i, '').trim();
  return `${brand} ${formatFaceLabel(faceValue)}`;
}

function computeSellPrice(faceValue, providerCost, siblings) {
  const face = Math.round(Number(faceValue));
  const cost = Number(providerCost);
  // Prefer siblings with face > 20k so a lone 10k (sell=face) does not force 100% ratio on higher SKUs.
  const pricedSiblings = siblings.filter((s) => Number(s.faceValue) > 20000);
  const pool = pricedSiblings.length ? pricedSiblings : siblings;
  let sell;
  if (pool.length) {
    const closest = [...pool].sort(
      (a, b) =>
        Math.abs(Number(a.faceValue) - face) - Math.abs(Number(b.faceValue) - face),
    )[0];
    const ratio = Number(closest.sellPrice) / Number(closest.faceValue);
    sell = Math.round(face * ratio);
  } else if (face <= 20000) {
    sell = face;
  } else {
    sell = Math.round(face * 0.98);
  }
  if (sell <= cost) {
    sell = Math.ceil(cost * 1.03);
  }
  return sell;
}

async function ensureProduct(meta, categoryBySlug) {
  const existing = await prisma.product.findFirst({
    where: { slug: meta.slug, deletedAt: null },
  });
  if (existing) return existing;

  const category = categoryBySlug.get(meta.categorySlug);
  if (!category) {
    throw new Error(`Category not found: ${meta.categorySlug}`);
  }

  const maxSort = await prisma.product.aggregate({
    where: { categoryId: category.id, deletedAt: null },
    _max: { sortOrder: true },
  });

  if (DRY_RUN) {
    console.log(`[dry-run] create product ${meta.slug}`);
    return {
      id: randomUUID(),
      slug: meta.slug,
      name: meta.name,
      categoryId: category.id,
      homeService: meta.homeService,
      _dryRun: true,
    };
  }

  return prisma.product.create({
    data: {
      slug: meta.slug,
      name: meta.name,
      categoryId: category.id,
      homeService: meta.homeService,
      status: CatalogProductStatus.ACTIVE,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      description: null,
    },
  });
}

async function main() {
  const provider = await prisma.provider.findFirst({ where: { code: 'ESALE', deletedAt: null } });
  if (!provider) throw new Error('ESALE provider not found');

  const categories = await prisma.productCategory.findMany();
  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));

  const config = await resolveEsaleConfig();
  const catalog = await fetchEsaleCardAndGameCatalog(config);
  console.log(`[map-missing] eSale Card+Game catalog: ${catalog.length}`);

  const existingMappings = await prisma.providerProductMapping.findMany({
    where: { providerId: provider.id },
    select: { providerProductCode: true, status: true },
  });
  const mappedCodes = new Set(
    existingMappings
      .filter((m) => m.status === ProviderProductMappingStatus.ACTIVE)
      .map((m) => m.providerProductCode.toUpperCase()),
  );

  const missing = catalog.filter((item) => !mappedCodes.has(item.code.toUpperCase()));
  console.log(`[map-missing] unmapped Card/Game: ${missing.length}`);

  const skippedUnknown = [];
  const created = [];
  const mapped = [];

  for (const item of missing) {
    const meta = SUPPLIER_PRODUCT[item.supplierCode];
    if (!meta) {
      skippedUnknown.push(item);
      continue;
    }

    const product = await ensureProduct(meta, categoryBySlug);
    const siblings = product._dryRun
      ? []
      : await prisma.productVariant.findMany({
          where: { productId: product.id, deletedAt: null, status: ProductVariantStatus.ACTIVE },
        });

    const sku = buildSku(item.supplierCode, item.faceValue);
    const sellPrice = computeSellPrice(item.faceValue, item.providerCost, siblings);
    const name = buildVariantName(meta.name, item.faceValue);

    let variant = product._dryRun
      ? null
      : await prisma.productVariant.findFirst({
          where: { sku, deletedAt: null },
        });

    if (!variant && !DRY_RUN) {
      const softDeleted = await prisma.productVariant.findFirst({ where: { sku } });
      if (softDeleted?.deletedAt) {
        variant = await prisma.productVariant.update({
          where: { id: softDeleted.id },
          data: {
            deletedAt: null,
            status: ProductVariantStatus.ACTIVE,
            name,
            faceValue: new Decimal(item.faceValue),
            sellPrice: new Decimal(sellPrice),
            type: ProductVariantType.CARD,
            productId: product.id,
          },
        });
        created.push({ action: 'restore-variant', sku, code: item.code });
      } else if (softDeleted) {
        variant = softDeleted;
      } else {
        variant = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            name,
            type: ProductVariantType.CARD,
            faceValue: new Decimal(item.faceValue),
            sellPrice: new Decimal(sellPrice),
            status: ProductVariantStatus.ACTIVE,
            metadata: {
              esaleSupplierCode: item.supplierCode,
              esaleCardId: item.cardId,
              esaleCardType: item.cardType,
            },
          },
        });
        created.push({ action: 'create-variant', sku, code: item.code, sellPrice });
      }
    } else if (DRY_RUN) {
      created.push({ action: 'create-variant', sku, code: item.code, sellPrice, cost: item.providerCost });
    }

    if (DRY_RUN) {
      mapped.push({ sku, code: item.code, cost: item.providerCost, sellPrice });
      continue;
    }

    if (!variant) {
      throw new Error(`Variant missing for ${sku}`);
    }

    const existing = await prisma.providerProductMapping.findFirst({
      where: {
        providerId: provider.id,
        productVariantId: variant.id,
        providerProductCode: item.code,
      },
    });

    if (existing) {
      await prisma.providerProductMapping.update({
        where: { id: existing.id },
        data: {
          status: ProviderProductMappingStatus.ACTIVE,
          availability: ProviderProductAvailability.AVAILABLE,
          providerCost: new Decimal(item.providerCost),
          priority: existing.priority || 100,
        },
      });
      mapped.push({ action: 'reactivate', sku, code: item.code });
    } else {
      const anyInactiveSameCode = await prisma.providerProductMapping.findFirst({
        where: {
          providerId: provider.id,
          providerProductCode: item.code,
          status: ProviderProductMappingStatus.INACTIVE,
        },
      });
      if (anyInactiveSameCode && anyInactiveSameCode.productVariantId !== variant.id) {
        await prisma.providerProductMapping.update({
          where: { id: anyInactiveSameCode.id },
          data: { status: ProviderProductMappingStatus.INACTIVE },
        });
      }

      await prisma.providerProductMapping.create({
        data: {
          providerId: provider.id,
          productVariantId: variant.id,
          providerProductCode: item.code,
          providerCost: new Decimal(item.providerCost),
          priority: 100,
          status: ProviderProductMappingStatus.ACTIVE,
          availability: ProviderProductAvailability.AVAILABLE,
        },
      });
      mapped.push({ action: 'create-mapping', sku, code: item.code, cost: item.providerCost, sellPrice });
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        catalogCardGame: catalog.length,
        missingInitially: missing.length,
        variantsTouched: created.length,
        mappingsTouched: mapped.length,
        skippedUnknownSupplier: skippedUnknown.map((s) => s.code),
        created,
        mapped,
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
