#!/usr/bin/env node
/**
 * Fix DATA provider mappings to eSale Card3G codes (VIETTEL3G:606, etc.).
 * Usage: docker exec cardon-prod-api node /app/scripts/deploy/fix-data-mappings.mjs
 */
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaClient, ProductVariantType } from '@prisma/client';

const prisma = new PrismaClient();

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function deriveEncryptionKey() {
  return createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
}

function decryptSettingField(payload) {
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
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.esale' },
  });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const cardApiUrl = `${(stored.cardApiUrl ?? process.env.ESALE_API_URL_CARD).replace(/\/$/, '')}/`;
  const agencyCode = stored.agencyCode ?? process.env.ESALE_AGENCY_CODE;
  const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
  const secretKey =
    (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
    process.env.ESALE_SECRET_KEY;
  return { cardApiUrl, agencyCode, clientCode, secretKey };
}

async function fetchCard3gCatalog(config) {
  const time = Math.floor(Date.now() / 1000).toString();
  const sig = sha256Hex(`${config.agencyCode}|${time}|${config.secretKey}`);
  const response = await fetch(`${config.cardApiUrl}getcardlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      cardType: 'Card3G',
      time,
      sig,
    }),
  });
  const payload = await response.json();
  if (payload.retCode !== 1) {
    throw new Error(`getcardlist Card3G failed: ${payload.retCode} ${payload.retMsg}`);
  }
  return payload.data?.info ?? [];
}

const SUPPLIER_BY_SLUG = {
  'data-viettel': 'VIETTEL3G',
  'data-mobifone': 'MOBIFONE3G',
  'data-vinaphone': 'VINAPHONE3G',
};

function resolvePackageName(variant) {
  const metadata =
    variant.metadata && typeof variant.metadata === 'object' && !Array.isArray(variant.metadata)
      ? variant.metadata
      : {};
  if (typeof metadata.packageName === 'string' && metadata.packageName.trim()) {
    return metadata.packageName.trim().toUpperCase();
  }
  const skuMatch = variant.sku.match(/_([A-Z0-9]+)$/i);
  return skuMatch ? skuMatch[1].toUpperCase() : variant.sku.toUpperCase();
}

async function main() {
  const config = await resolveEsaleConfig();
  const catalog = await fetchCard3gCatalog(config);
  const byCode = new Map(
    catalog.map((item) => [
      `${item.supplierCode}:${item.cardCode}`.toUpperCase(),
      item,
    ]),
  );

  const mappings = await prisma.providerProductMapping.findMany({
    where: {
      status: 'ACTIVE',
      productVariant: { type: ProductVariantType.DATA, deletedAt: null },
    },
    include: {
      productVariant: {
        select: {
          id: true,
          sku: true,
          faceValue: true,
          metadata: true,
          product: { select: { slug: true } },
        },
      },
    },
  });

  const updates = [];
  const unmatched = [];

  for (const mapping of mappings) {
    const variant = mapping.productVariant;
    const supplier =
      SUPPLIER_BY_SLUG[variant.product.slug] ??
      (variant.product.slug.includes('viettel')
        ? 'VIETTEL3G'
        : variant.product.slug.includes('mobi')
          ? 'MOBIFONE3G'
          : variant.product.slug.includes('vina')
            ? 'VINAPHONE3G'
            : null);

    if (!supplier) {
      unmatched.push({ sku: variant.sku, reason: 'unknown product slug' });
      continue;
    }

    const packageName = resolvePackageName(variant);
    const match =
      byCode.get(`${supplier}:${packageName}`.toUpperCase()) ??
      catalog.find(
        (item) =>
          item.supplierCode === supplier &&
          Math.round(item.unitPrice) === Math.round(Number(variant.faceValue)),
      );

    if (!match) {
      unmatched.push({ sku: variant.sku, packageName, supplier, reason: 'no Card3G match' });
      continue;
    }

    const providerProductCode = `${match.supplierCode}:${match.cardId}`;
    if (mapping.providerProductCode === providerProductCode) {
      continue;
    }

    await prisma.providerProductMapping.update({
      where: { id: mapping.id },
      data: {
        providerProductCode,
        providerCost: match.priceDiscount,
      },
    });
    updates.push({
      sku: variant.sku,
      from: mapping.providerProductCode,
      to: providerProductCode,
      cardName: match.cardName,
    });
  }

  console.log(
    JSON.stringify(
      {
        catalogItems: catalog.length,
        updated: updates.length,
        updates,
        unmatched,
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
