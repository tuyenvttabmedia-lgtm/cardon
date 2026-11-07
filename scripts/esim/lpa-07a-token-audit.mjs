/**
 * LPA-07A: inspect Airalo token credential source. No CREATE. No token retry.
 * Does not print secrets or decrypted values.
 */
import { createHash, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(import.meta.dirname, '../..');

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
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('enc_shape');
  }
  const key = createHash('sha256').update(encryptionKey).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function classifyPlain(value) {
  const trimmed = value.trim();
  const bullets = (trimmed.match(/\u2022/g) || []).length;
  const blackCircles = (trimmed.match(/\u25CF/g) || []).length;
  const asterisks = (trimmed.match(/\*/g) || []).length;
  return {
    length: trimmed.length,
    empty: trimmed.length === 0,
    hadOuterWhitespace: value !== trimmed,
    hasInternalWhitespace: /\s/.test(trimmed),
    looksMasked: /^\*{8}/.test(trimmed),
    mostlyMaskGlyphs: trimmed.length > 0 && bullets + blackCircles + asterisks >= trimmed.length,
    maskGlyphCounts: { bullets, blackCircles, asterisks },
    charset: !trimmed
      ? 'empty'
      : /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
        ? 'uuid'
        : /^\d+$/.test(trimmed)
          ? 'digits'
          : /^[0-9a-f]+$/i.test(trimmed)
            ? 'hex'
            : /^[A-Za-z0-9._-]+$/.test(trimmed)
              ? 'safe-token'
              : 'other',
    extra: {
      plus: trimmed.includes('+'),
      slash: trimmed.includes('/'),
      at: trimmed.includes('@'),
      colon: trimmed.includes(':'),
      comma: trimmed.includes(','),
      percent: trimmed.includes('%'),
      quotes: /['"]/.test(trimmed),
      nonAscii: /[^\x00-\x7F]/.test(trimmed),
    },
  };
}

function encShape(payload) {
  if (typeof payload !== 'string' || !payload) return { present: false };
  const parts = payload.split(':');
  return {
    present: true,
    partCount: parts.length,
    looksAesGcm: parts.length === 3 && parts.every((part) => part.length > 0),
    totalLength: payload.length,
  };
}

const primary = loadEnvFile('.env');
const localFull = loadEnvFile('.env.local-full');
const dockerKey = localFull.ENCRYPTION_KEY || '';
const envKey = primary.ENCRYPTION_KEY || '';
const postgresUser = localFull.POSTGRES_USER || primary.POSTGRES_USER;
const postgresPassword = localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD;
const postgresDb = localFull.POSTGRES_DB || primary.POSTGRES_DB;

const report = {
  gate: 'LPA-07A',
  tokenCalledThisAudit: false,
  createCalled: false,
  source: {
    intended: 'system_settings.key=settings.provider.airalo on docker localhost:5433',
    envAiraloClientIdPresent: Boolean(primary.AIRALO_CLIENT_ID || localFull.AIRALO_CLIENT_ID),
    envAiraloClientSecretPresent: Boolean(primary.AIRALO_CLIENT_SECRET || localFull.AIRALO_CLIENT_SECRET),
    encryptionKeysEqual: Boolean(dockerKey && envKey && dockerKey === envKey),
    dockerEncryptionKeyPresent: Boolean(dockerKey),
  },
  tokenRequestContract: {
    endpoint: 'POST https://partners-api.airalo.com/v2/token',
    contentType: 'application/x-www-form-urlencoded',
    fields: ['client_id', 'client_secret', 'grant_type=client_credentials'],
    extraHeadersOnScript: ['Accept: application/json', 'Accept-Language: vi'],
    adapterMatchesDocs: true,
  },
};

if (!postgresUser || !postgresPassword || !postgresDb || !dockerKey) {
  report.stop = 'Missing localhost docker DB or ENCRYPTION_KEY metadata. No token call.';
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const url = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:5433/${postgresDb}?schema=public`;
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.airalo' },
  });
  const value = row && typeof row.value === 'object' && row.value ? row.value : {};
  let baseHost = null;
  if (typeof value.baseUrl === 'string' && value.baseUrl) {
    try {
      baseHost = new URL(value.baseUrl).host;
    } catch {
      baseHost = 'invalid';
    }
  }
  report.setting = {
    present: Boolean(row),
    updatedAt: row?.updatedAt ?? null,
    baseHost,
    clientIdEnc: encShape(value.clientIdEnc),
    clientSecretEnc: encShape(value.clientSecretEnc),
  };

  if (!row || !value.clientIdEnc || !value.clientSecretEnc) {
    report.conclusion = 'Setting row or enc fields missing. Script would fall back to ENV, which is empty.';
    console.log(JSON.stringify(report, null, 2));
  } else {
    try {
      const rawId = decryptRaw(value.clientIdEnc, dockerKey);
      const rawSecret = decryptRaw(value.clientSecretEnc, dockerKey);
      report.decrypted = {
        usedKey: 'ENCRYPTION_KEY from .env.local-full (docker stack)',
        clientId: classifyPlain(rawId),
        clientSecret: classifyPlain(rawSecret),
      };
      report.envWouldOverride =
        report.source.envAiraloClientIdPresent && classifyPlain(rawId).empty;
    } catch (error) {
      report.decrypted = {
        usedKey: 'ENCRYPTION_KEY from .env.local-full (docker stack)',
        failed: true,
        errorName: error instanceof Error ? error.name : 'Error',
      };
    }
    console.log(JSON.stringify(report, null, 2));
  }
} catch (error) {
  report.db = {
    connected: false,
    errorName: error instanceof Error ? error.name : 'Error',
  };
  report.priorTokenEvidence = {
    from: 'LPA-07 first probe',
    sourceThen: 'docker localhost:5433 / settings.provider.airalo',
    tokenStatus: 422,
    field: 'client_id',
    createCount: 0,
  };
  console.log(JSON.stringify(report, null, 2));
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
