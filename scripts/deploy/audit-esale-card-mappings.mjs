#!/usr/bin/env node
/**
 * Compare ACTIVE eSale provider_product_mappings for CARD variants
 * against live getcardlist (Card / Game / Card3G).
 */
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function deriveEncryptionKey() {
  return createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
}

function decryptSettingField(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const key = deriveEncryptionKey();
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  d.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    d.update(Buffer.from(dataB64, 'base64')),
    d.final(),
  ]).toString('utf8');
}

function sha256Hex(v) {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}

function parseCode(code) {
  const m = String(code || '')
    .trim()
    .match(/^([^:]+):(\d+)$/);
  if (!m) return null;
  return { supplier: m[1].toUpperCase(), cardId: m[2] };
}

function faceFromName(name) {
  const n = String(name || '')
    .replace(/\./g, '')
    .replace(/,/g, '');
  const m = n.match(/(\d[\d\s]*)\s*(vnđ|vnd|đ)?/i);
  if (!m) return null;
  const num = Number(m[1].replace(/\s/g, ''));
  return Number.isFinite(num) ? num : null;
}

async function resolveEsaleConfig() {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.esale' },
  });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const cardApiUrl = `${(
    stored.cardApiUrl ||
    process.env.ESALE_API_URL_CARD ||
    process.env.ESALE_API_URL ||
    ''
  ).replace(/\/$/, '')}/`;
  return {
    cardApiUrl,
    agencyCode: stored.agencyCode || process.env.ESALE_AGENCY_CODE,
    clientCode: stored.clientCode || process.env.ESALE_CLIENT_CODE,
    secretKey:
      (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ||
      process.env.ESALE_SECRET_KEY,
  };
}

async function fetchCardType(config, cardType) {
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
  return response.json();
}

async function main() {
  const config = await resolveEsaleConfig();
  const catalog = new Map();
  const bySupplierFace = new Map();
  const typeStats = {};

  for (const cardType of ['Card', 'Game', 'Card3G']) {
    const payload = await fetchCardType(config, cardType);
    const items = payload.data?.info || [];
    typeStats[cardType] = { retCode: payload.retCode, count: items.length };
    for (const it of items) {
      const supplier = String(it.supplierCode || it.SupplierCode || '').toUpperCase();
      const cardId = String(it.cardId || it.CardID || '');
      if (!supplier || !cardId) continue;
      const code = `${supplier}:${cardId}`;
      const face =
        Number(it.faceValue || it.FaceValue) || faceFromName(it.cardName || it.name) || null;
      const entry = {
        code,
        supplier,
        cardId,
        cardType,
        cardName: it.cardName || it.name || '',
        faceValue: face,
        discount: it.discount,
      };
      catalog.set(code, entry);
      if (face != null) {
        const k = `${supplier}|${face}`;
        if (!bySupplierFace.has(k)) bySupplierFace.set(k, []);
        bySupplierFace.get(k).push(entry);
      }
    }
  }

  const esale = await prisma.provider.findFirst({ where: { code: 'ESALE' } });
  if (!esale) throw new Error('ESALE provider not found');

  const mappings = await prisma.providerProductMapping.findMany({
    where: { providerId: esale.id },
    include: {
      productVariant: {
        select: { id: true, sku: true, faceValue: true, status: true, type: true },
      },
    },
  });

  const missing = [];
  const faceMismatch = [];
  const ok = [];
  const suggest = [];
  const malformed = [];
  const topupSkipped = [];

  for (const m of mappings) {
    const v = m.productVariant;
    // Topup codes are TELCO:AMOUNT — not in getcardlist
    if (v?.type && String(v.type) !== 'CARD') {
      topupSkipped.push({ sku: v.sku, type: v.type, code: m.providerProductCode });
      continue;
    }

    const parsed = parseCode(m.providerProductCode);
    if (!parsed) {
      malformed.push({
        sku: v?.sku,
        mapping: m.providerProductCode,
        status: m.status,
        variantStatus: v?.status,
      });
      continue;
    }

    const live =
      catalog.get(String(m.providerProductCode).toUpperCase()) ||
      catalog.get(`${parsed.supplier}:${parsed.cardId}`);
    const face = v?.faceValue != null ? Number(v.faceValue) : null;

    if (!live) {
      const alts = face != null ? bySupplierFace.get(`${parsed.supplier}|${face}`) || [] : [];
      const row = {
        sku: v?.sku,
        variantStatus: v?.status,
        mappingStatus: m.status,
        availability: m.availability,
        ourCode: m.providerProductCode,
        ourFace: face,
        suggested: alts.map((a) => ({
          code: a.code,
          name: a.cardName,
          face: a.faceValue,
          type: a.cardType,
        })),
      };
      missing.push(row);
      if (alts.length === 1) {
        suggest.push({
          sku: v?.sku,
          from: m.providerProductCode,
          to: alts[0].code,
          face,
          mappingStatus: m.status,
          variantStatus: v?.status,
        });
      }
      continue;
    }

    if (face != null && live.faceValue != null && Math.abs(face - live.faceValue) > 0.01) {
      faceMismatch.push({
        sku: v?.sku,
        ourCode: m.providerProductCode,
        ourFace: face,
        liveFace: live.faceValue,
        liveName: live.cardName,
        liveType: live.cardType,
        mappingStatus: m.status,
        variantStatus: v?.status,
      });
    } else {
      ok.push({
        sku: v?.sku,
        code: m.providerProductCode,
        face,
        liveName: live.cardName,
      });
    }
  }

  const activeMissing = missing.filter(
    (x) => x.variantStatus === 'ACTIVE' && x.mappingStatus === 'ACTIVE',
  );
  const inactiveMissing = missing.filter(
    (x) => !(x.variantStatus === 'ACTIVE' && x.mappingStatus === 'ACTIVE'),
  );

  console.log(
    JSON.stringify(
      {
        catalogStats: typeStats,
        catalogSize: catalog.size,
        mappingCount: mappings.length,
        topupSkippedCount: topupSkipped.length,
        okCount: ok.length,
        missingActiveCount: activeMissing.length,
        missingOtherCount: inactiveMissing.length,
        faceMismatchCount: faceMismatch.length,
        malformedCount: malformed.length,
        autoSuggestCount: suggest.filter(
          (s) => s.variantStatus === 'ACTIVE' && s.mappingStatus === 'ACTIVE',
        ).length,
        missingActive: activeMissing,
        faceMismatch,
        malformed,
        autoSuggestActive: suggest.filter(
          (s) => s.variantStatus === 'ACTIVE' && s.mappingStatus === 'ACTIVE',
        ),
        missingOther: inactiveMissing,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
