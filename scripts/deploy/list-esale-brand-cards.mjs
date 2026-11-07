#!/usr/bin/env node
import { createDecipheriv, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WANT = new Set([
  'FUNCARD',
  'SOHACOIN',
  'APPOTA',
  'GARENA',
  'VTC',
  'VIETNAMOBILE',
  'VIETTEL',
]);

function decryptSettingField(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const key = createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
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
function faceFromName(name) {
  const n = String(name || '').replace(/\./g, '').replace(/,/g, '');
  const m = n.match(/(\d[\d\s]*)/);
  return m ? Number(m[1].replace(/\s/g, '')) : null;
}

const row = await prisma.systemSetting.findUnique({
  where: { key: 'settings.provider.esale' },
});
const st = row?.value && typeof row.value === 'object' ? row.value : {};
const url = `${(
  st.cardApiUrl ||
  process.env.ESALE_API_URL_CARD ||
  process.env.ESALE_API_URL ||
  ''
).replace(/\/$/, '')}/`;
const agency = st.agencyCode || process.env.ESALE_AGENCY_CODE;
const client = st.clientCode || process.env.ESALE_CLIENT_CODE;
const secret =
  (st.secretKeyEnc ? decryptSettingField(st.secretKeyEnc) : undefined) ||
  process.env.ESALE_SECRET_KEY;

const out = {};
for (const t of ['Card', 'Game', 'Card3G']) {
  const time = String(Math.floor(Date.now() / 1000));
  const sig = sha256Hex(`${agency}|${time}|${secret}`);
  const r = await fetch(`${url}getcardlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agencyCode: agency,
      clientCode: client,
      cardType: t,
      time,
      sig,
    }),
  });
  const j = await r.json();
  for (const it of j.data?.info || []) {
    const s = String(it.supplierCode || '').toUpperCase();
    if (!WANT.has(s)) continue;
    if (!out[s]) out[s] = [];
    out[s].push({
      code: `${s}:${it.cardId}`,
      name: it.cardName,
      face: Number(it.faceValue) || faceFromName(it.cardName),
      type: t,
    });
  }
}
for (const s of Object.keys(out)) out[s].sort((a, b) => (a.face || 0) - (b.face || 0));
console.log(JSON.stringify(out, null, 2));
await prisma.$disconnect();
