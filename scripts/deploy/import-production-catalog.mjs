/**
 * Import catalog export onto production VPS and fix eSale provider mappings.
 *
 * Usage (production API container):
 *   node /app/scripts/deploy/import-production-catalog.mjs /tmp/catalog-export.json
 */
import { createDecipheriv, createHash } from 'crypto';
import { readFileSync } from 'fs';
import { PrismaClient, ProductVariantType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const ESALE_SETTINGS_KEY = 'settings.provider.esale';

const SUPPLIER_BY_PRODUCT_SLUG = {
  'garena-card': 'GARENA',
  'zing-card': 'ZING',
  'gosu-card': 'GOSU',
  'soha-card': 'SOHACOIN',
  scoin: 'SCOIN',
  'kul-card': 'KUL',
  'appota-card': 'APPOTA',
  'vcoin-card': 'VTC',
  'viettel-card': 'VIETTEL',
  mobifone: 'MOBIFONE',
  vinaphone: 'VINAPHONE',
  vietnamobile: 'VIETNAMOBILE',
  'viettel-topup': 'viettel',
  'mobifone-topup': 'mobifone',
  'vinaphone-topup': 'vinaphone',
  'data-viettel': 'VIETTEL',
  'data-mobifone': 'MOBIFONE',
};

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizePem(value) {
  if (!value) return '';
  return value.replace(/\\n/g, '\n').trim();
}

function deriveEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('ENCRYPTION_KEY is not configured');
  }
  return createHash('sha256').update(secret).digest();
}

function decryptSettingField(payload) {
  if (!payload) return undefined;
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const key = deriveEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function resolveEsaleConfig() {
  const row = await prisma.systemSetting.findUnique({ where: { key: ESALE_SETTINGS_KEY } });
  const stored =
    row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};

  const cardApiUrl =
    stored.cardApiUrl ??
    process.env.ESALE_API_URL_CARD ??
    process.env.ESALE_API_URL;
  const topupApiUrl = stored.topupApiUrl ?? process.env.ESALE_API_URL_TOPUP;
  const agencyCode =
    stored.agencyCode ??
    process.env.ESALE_AGENCY_CODE ??
    process.env.ESALE_PARTNER_ID;
  const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
  const secretKey =
    (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
    process.env.ESALE_SECRET_KEY ??
    process.env.ESALE_PARTNER_KEY;

  if (!cardApiUrl || !agencyCode || !clientCode || !secretKey) {
    throw new Error('eSale is not configured (Admin settings or ESALE_* env)');
  }

  return {
    cardApiUrl: `${cardApiUrl.replace(/\/$/, '')}/`,
    topupApiUrl: topupApiUrl ? `${topupApiUrl.replace(/\/$/, '')}/` : '',
    agencyCode,
    clientCode,
    secretKey,
  };
}

async function fetchEsaleCardCatalog(config) {
  const types = ['Card', 'Game', 'Card3G'];
  const items = [];

  for (const cardType of types) {
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

    if (!response.ok) {
      throw new Error(`getcardlist HTTP ${response.status} for ${cardType}`);
    }

    const payload = await response.json();
    if (payload.retCode !== 1) {
      console.warn('[import-production-catalog] getcardlist failed', cardType, payload.retCode, payload.retMsg);
      continue;
    }
    if (!payload.data?.info?.length) {
      continue;
    }

    for (const item of payload.data.info) {
      items.push({
        supplierCode: item.supplierCode,
        cardId: item.cardId,
        cardName: item.cardName,
        faceValue: Number(item.unitPrice),
        providerCost: Number(item.priceDiscount),
      });
    }
  }

  return items;
}

function buildCardCode(supplierCode, cardId) {
  return `${supplierCode}:${cardId}`;
}

function resolveCardSupplier(productSlug) {
  return SUPPLIER_BY_PRODUCT_SLUG[productSlug] ?? null;
}

function resolveTopupCode(variant) {
  const sku = variant.sku.trim();
  const faceValue = Number(variant.faceValue);

  if (/^[a-z]+:\d+$/i.test(sku)) {
    return sku.toLowerCase();
  }

  const popupMobi = sku.match(/^POPUPMOBI_(\d+)K$/i);
  if (popupMobi) return `mobifone:${Number(popupMobi[1]) * 1000}`;

  const popupVina = sku.match(/^POPUPVINA_(\d+)K$/i);
  if (popupVina) return `vinaphone:${Number(popupVina[1]) * 1000}`;

  const napViettel = sku.match(/^NAPVIETTEL_(\d+)K$/i);
  if (napViettel) return `viettel:${Number(napViettel[1]) * 1000}`;

  const dashTopup = sku.match(/^(VIETTEL|MOBIFONE|VINAPHONE)-TOPUP-(\d+)K$/i);
  if (dashTopup) {
    const telco =
      dashTopup[1].toUpperCase() === 'MOBIFONE'
        ? 'mobifone'
        : dashTopup[1].toUpperCase() === 'VINAPHONE'
          ? 'vinaphone'
          : 'viettel';
    return `${telco}:${Number(dashTopup[2]) * 1000}`;
  }

  const telcoPrefix = sku.match(/^(VIETTEL|MOBIFONE|VINAPHONE|VIETNAMOBILE)_TOPUP_(\d+)$/i);
  if (telcoPrefix) {
    const telco = telcoPrefix[1].toLowerCase();
    return `${telco}:${Number(telcoPrefix[2])}`;
  }

  return `viettel:${Math.round(faceValue)}`;
}

function resolveDataCode(variant, productSlug, card3gCatalog) {
  const metadata =
    variant.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
      ? variant.metadata
      : {};
  const packageName =
    typeof metadata.packageName === 'string' && metadata.packageName.trim()
      ? metadata.packageName.trim().toUpperCase()
      : null;
  const supplierPrefix = SUPPLIER_BY_PRODUCT_SLUG[productSlug];
  const supplier3g =
    supplierPrefix === 'VIETTEL'
      ? 'VIETTEL3G'
      : supplierPrefix === 'MOBIFONE'
        ? 'MOBIFONE3G'
        : supplierPrefix === 'VINAPHONE'
          ? 'VINAPHONE3G'
          : null;

  if (supplier3g && card3gCatalog?.length) {
    const byPackage = packageName
      ? card3gCatalog.find(
          (item) =>
            item.supplierCode === supplier3g &&
            String(item.cardCode).toUpperCase() === packageName,
        )
      : null;
    const byFaceValue = card3gCatalog.find(
      (item) =>
        item.supplierCode === supplier3g &&
        Math.round(item.faceValue) === Math.round(Number(variant.faceValue)),
    );
    const match = byPackage ?? byFaceValue;
    if (match) {
      return buildCardCode(match.supplierCode, match.cardId);
    }
  }

  const telcoPrefix = SUPPLIER_BY_PRODUCT_SLUG[productSlug] ?? 'VIETTEL';
  if (packageName) {
    return `${telcoPrefix}_DATA_${packageName}`;
  }
  return `${telcoPrefix}_DATA_${variant.sku}`;
}

function findCardCatalogMatch(catalog, supplierCode, faceValue) {
  const target = Math.round(faceValue);
  const exact = catalog.filter(
    (item) => item.supplierCode === supplierCode && Math.round(item.faceValue) === target,
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    return exact.sort((a, b) => a.cardId - b.cardId)[0];
  }
  return null;
}

async function main() {
  const inputPath = process.argv[2] ?? '/tmp/catalog-export.json';
  const payload = JSON.parse(readFileSync(inputPath, 'utf8'));

  const provider = await prisma.provider.findFirst({ where: { code: 'ESALE' } });
  if (!provider) {
    throw new Error('ESALE provider not found on production');
  }

  const variantById = new Map(payload.variants.map((v) => [v.id, v]));
  const productById = new Map(payload.products.map((p) => [p.id, p]));

  console.log('[import-production-catalog] loading eSale card catalog...');
  const esaleConfig = await resolveEsaleConfig();
  console.log('[import-production-catalog] eSale client:', esaleConfig.clientCode);
  const esaleCatalog = await fetchEsaleCardCatalog(esaleConfig);
  console.log('[import-production-catalog] eSale cards:', esaleCatalog.length);
  const card3gCatalog = esaleCatalog.filter((item) =>
    String(item.supplierCode).toUpperCase().endsWith('3G'),
  );

  const dedupedMappings = [];
  const byVariant = new Map();
  for (const mapping of payload.mappings) {
    const list = byVariant.get(mapping.productVariantId) ?? [];
    list.push(mapping);
    byVariant.set(mapping.productVariantId, list);
  }
  for (const [, list] of byVariant) {
    list.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));
    dedupedMappings.push(list[0]);
  }

  await prisma.$transaction(async (tx) => {
    await tx.providerProductMapping.deleteMany({});
    await tx.productVariant.deleteMany({});
    await tx.product.deleteMany({});
    await tx.productCategory.deleteMany({});

    for (const row of payload.categories) {
      await tx.productCategory.create({ data: row });
    }
    for (const row of payload.products) {
      await tx.product.create({ data: row });
    }
    for (const row of payload.variants) {
      await tx.productVariant.create({ data: row });
    }

    let fixedCard = 0;
    let fixedTopup = 0;
    let fixedData = 0;
    const unmatched = [];

    for (const mapping of dedupedMappings) {
      const variant = variantById.get(mapping.productVariantId);
      const product = variant ? productById.get(variant.productId) : null;
      if (!variant || !product) {
        unmatched.push({ sku: 'unknown', reason: 'missing variant/product' });
        continue;
      }

      let providerProductCode = mapping.providerProductCode;
      let providerCost = new Decimal(mapping.providerCost);

      if (variant.type === ProductVariantType.CARD) {
        const supplierCode = resolveCardSupplier(product.slug);
        if (!supplierCode) {
          unmatched.push({ sku: variant.sku, reason: 'unknown supplier slug' });
          continue;
        }
        const match = findCardCatalogMatch(
          esaleCatalog,
          supplierCode,
          Number(variant.faceValue),
        );
        if (!match) {
          unmatched.push({
            sku: variant.sku,
            reason: `no eSale card for ${supplierCode} @ ${variant.faceValue}`,
          });
          continue;
        }
        providerProductCode = buildCardCode(match.supplierCode, match.cardId);
        providerCost = new Decimal(match.providerCost);
        fixedCard += 1;
      } else if (variant.type === ProductVariantType.TOPUP) {
        providerProductCode = resolveTopupCode(variant);
        fixedTopup += 1;
      } else if (variant.type === ProductVariantType.DATA) {
        providerProductCode = resolveDataCode(variant, product.slug, card3gCatalog);
        const card3gMatch = card3gCatalog.find((item) => {
          const code = buildCardCode(item.supplierCode, item.cardId);
          return code === providerProductCode;
        });
        if (card3gMatch) {
          providerCost = new Decimal(card3gMatch.providerCost);
        }
        fixedData += 1;
      }

      await tx.providerProductMapping.create({
        data: {
          ...mapping,
          providerId: provider.id,
          providerProductCode,
          providerCost,
        },
      });
    }

    console.log(
      '[import-production-catalog] mappings fixed',
      JSON.stringify({ fixedCard, fixedTopup, fixedData, unmatched: unmatched.length }),
    );
    if (unmatched.length) {
      console.log('[import-production-catalog] unmatched sample:', unmatched.slice(0, 15));
    }
  });

  const stats = {
    categories: await prisma.productCategory.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    mappings: await prisma.providerProductMapping.count(),
  };
  console.log('[import-production-catalog] done', JSON.stringify(stats));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
