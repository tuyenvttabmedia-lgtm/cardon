#!/usr/bin/env node
/** Search eSale card catalog for DATA package codes (Card3G etc). */
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function resolveEsaleConfig() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'settings.provider.esale' } });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const cardApiUrl = `${(stored.cardApiUrl ?? process.env.ESALE_API_URL_CARD ?? process.env.ESALE_API_URL).replace(/\/$/, '')}/`;
  const agencyCode = stored.agencyCode ?? process.env.ESALE_AGENCY_CODE;
  const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
  const secretKey =
    (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
    process.env.ESALE_SECRET_KEY;
  return { cardApiUrl, agencyCode, clientCode, secretKey };
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
  for (const cardType of ['Card', 'Card3G', 'Game']) {
    const payload = await fetchCardType(config, cardType);
    const items = payload.data?.info ?? [];
    const matches = items.filter((item) => {
      const name = `${item.supplierCode} ${item.cardName}`.toUpperCase();
      return /DW12|DATA|3G|4G|VIETTEL/.test(name);
    });
    console.log(
      JSON.stringify({
        cardType,
        retCode: payload.retCode,
        total: items.length,
        matches: matches.slice(0, 20).map((i) => ({
          supplierCode: i.supplierCode,
          cardId: i.cardId,
          cardName: i.cardName,
          unitPrice: i.unitPrice,
        })),
      }),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
