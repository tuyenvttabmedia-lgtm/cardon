/**
 * Sync eSale card catalog costs/availability for existing mappings.
 *
 * Usage:
 *   docker exec cardon-prod-api node /app/scripts/deploy/sync-esale-catalog-costs.mjs
 */
import { createDecipheriv, createHash } from 'crypto';
import { PrismaClient, ProviderProductAvailability, ProviderProductMappingStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();
const ESALE_SETTINGS_KEY = 'settings.provider.esale';

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
    const payload = await response.json();
    if (payload.retCode !== 1 || !payload.data?.info?.length) continue;
    for (const item of payload.data.info) {
      items.push({
        code: `${item.supplierCode}:${item.cardId}`,
        providerCost: Number(item.priceDiscount),
      });
    }
  }
  return items;
}

async function main() {
  const provider = await prisma.provider.findFirst({ where: { code: 'ESALE' } });
  if (!provider) throw new Error('ESALE provider missing');

  const config = await resolveEsaleConfig();
  const catalog = await fetchEsaleCardCatalog(config);
  const byCode = new Map(catalog.map((item) => [item.code, item]));
  const mappings = await prisma.providerProductMapping.findMany({
    where: { providerId: provider.id },
    include: { productVariant: true },
  });

  let updated = 0;
  let disabled = 0;

  for (const mapping of mappings) {
    if (mapping.productVariant.type !== 'CARD') continue;
    const item = byCode.get(mapping.providerProductCode);
    if (!item) {
      if (mapping.status === ProviderProductMappingStatus.ACTIVE) {
        await prisma.providerProductMapping.update({
          where: { id: mapping.id },
          data: {
            status: ProviderProductMappingStatus.INACTIVE,
            availability: ProviderProductAvailability.OUT_OF_STOCK,
          },
        });
        disabled += 1;
      }
      continue;
    }
    const nextCost = new Decimal(item.providerCost);
    if (!mapping.providerCost.equals(nextCost)) {
      await prisma.providerProductMapping.update({
        where: { id: mapping.id },
        data: {
          providerCost: nextCost,
          availability: ProviderProductAvailability.AVAILABLE,
        },
      });
      updated += 1;
    }
  }

  console.log('[sync-esale-catalog-costs]', JSON.stringify({ catalog: catalog.length, updated, disabled }));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
