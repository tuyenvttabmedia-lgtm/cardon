/**
 * LPA-07B follow-up: classify latest order LPA shape only. No CREATE. No secret print.
 */
import { createHash, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SANDBOX_LPA = /^LPA:1\$lpa\.airalo\.com\$TEST$/i;

function loadEnvFile(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function decryptRaw(payload, encryptionKey) {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const key = createHash('sha256').update(encryptionKey).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function hostClass(value) {
  const host = String(value || '').trim().toLowerCase();
  if (!host) return 'empty';
  if (host === 'lpa.airalo.com') return 'official_sandbox_host';
  if (host.endsWith('.airalo.com') || host === 'airalo.com') return 'airalo_other';
  return 'other_host';
}

function classifySim(sim) {
  const qrcode = typeof sim?.qrcode === 'string' ? sim.qrcode.trim() : '';
  const lpa = typeof sim?.lpa === 'string' ? sim.lpa.trim() : '';
  const matchingId = typeof sim?.matching_id === 'string' ? sim.matching_id.trim() : '';
  const parts = qrcode.startsWith('LPA:1$') ? qrcode.slice(6).split('$') : [];
  return {
    qrcodePresent: Boolean(qrcode),
    qrcodeStartsLpa1: qrcode.startsWith('LPA:1$'),
    qrcodeExactOfficialTest: SANDBOX_LPA.test(qrcode),
    qrcodePartCount: parts.length,
    qrcodeHost: hostClass(parts[0]),
    qrcodeMatchingIsTest: (parts[1] || '').toUpperCase() === 'TEST',
    qrcodeMatchingLength: parts[1] ? parts[1].length : 0,
    lpaHost: hostClass(lpa),
    matchingIsTest: matchingId.toUpperCase() === 'TEST',
    matchingLength: matchingId.length,
    hasIccid: Boolean(sim?.iccid),
    iccidLength: typeof sim?.iccid === 'string' ? sim.iccid.length : 0,
  };
}

const primary = loadEnvFile('.env');
const localFull = loadEnvFile('.env.local-full');
const dockerKey = localFull.ENCRYPTION_KEY || '';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${localFull.POSTGRES_USER || primary.POSTGRES_USER}:${localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD}@127.0.0.1:5433/${localFull.POSTGRES_DB || primary.POSTGRES_DB}?schema=public`,
    },
  },
});

try {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.airalo' },
  });
  const value = row && typeof row.value === 'object' && row.value ? row.value : {};
  const clientId = decryptRaw(value.clientIdEnc, dockerKey).trim();
  const clientSecret = decryptRaw(value.clientSecretEnc, dockerKey).trim();
  const tokenRes = await fetch('https://partners-api.airalo.com/v2/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });
  const tokenJson = await tokenRes.json();
  const token = tokenJson?.data?.access_token;
  const listRes = await fetch('https://partners-api.airalo.com/v2/orders?include=sims&limit=3&page=1', {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const listJson = await listRes.json();
  const rows = Array.isArray(listJson?.data) ? listJson.data : [];
  console.log(JSON.stringify({
    gate: 'LPA-07B-lpa-shape',
    tokenStatus: tokenRes.status,
    listStatus: listRes.status,
    createCalled: false,
    orders: rows.map((order) => ({
      idPresent: order?.id != null,
      idType: typeof order?.id,
      codeLooksDated: typeof order?.code === 'string' && /^\d{8}-\d+$/.test(order.code),
      packageIdPresent: Boolean(order?.package_id),
      simsCount: Array.isArray(order?.sims) ? order.sims.length : 0,
      sims: Array.isArray(order?.sims) ? order.sims.map(classifySim) : [],
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
