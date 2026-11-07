/**
 * LPA-07B: preflight saved Airalo creds, one token, at most one sandbox CREATE.
 * Never prints secrets, tokens, LPA, or raw bodies.
 */
import { createHash, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWED_HOST = 'partners-api.airalo.com';
const PREVIOUS_UPDATED = Date.parse('2026-10-24T16:29:16.852Z');
const SANDBOX_LPA = /^LPA:1\$lpa\.airalo\.com\$TEST$/i;
const ERROR_PACKAGE = /^test-(insufficient-balance|maintenance-mode|disabled-top-up|not-enough|out-of-stock|create-)/i;
let createCount = 0;
let tokenCount = 0;

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

function classifyPlain(value) {
  const trimmed = value.trim();
  return {
    length: trimmed.length,
    empty: trimmed.length === 0,
    hadOuterWhitespace: value !== trimmed,
    looksMasked: /^\*{8}/.test(trimmed),
    hasAt: trimmed.includes('@'),
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
  };
}

function classifyLpa(sim) {
  const qrcode = typeof sim?.qrcode === 'string' ? sim.qrcode.trim() : '';
  const lpa = typeof sim?.lpa === 'string' ? sim.lpa.trim() : '';
  const matchingId = typeof sim?.matching_id === 'string' ? sim.matching_id.trim() : '';
  if (SANDBOX_LPA.test(qrcode) || (lpa.toLowerCase() === 'lpa.airalo.com' && matchingId.toUpperCase() === 'TEST')) {
    return 'sandbox_test';
  }
  if (qrcode.startsWith('LPA:1$') || (lpa && matchingId && !lpa.toLowerCase().includes('lpa.airalo.com'))) {
    return 'not_sandbox_test';
  }
  return 'missing_or_unknown';
}

function redactError(status, text) {
  try {
    const parsed = JSON.parse(text);
    return {
      status,
      code: parsed.code ?? parsed.meta?.code ?? null,
      field: parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
        ? Object.keys(parsed.data)[0] ?? null
        : null,
    };
  } catch {
    return { status, code: null, field: null, unreadable: true };
  }
}

async function airalo(baseUrl, token, method, path, body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (typeof body === 'string') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = body;
  }
  const response = await fetch(`${baseUrl}${path}`, init);
  return { status: response.status, text: await response.text() };
}

function finish(report) {
  report.tokenCount = tokenCount;
  report.createCount = createCount;
  console.log(JSON.stringify(report, null, 2));
}

const primary = loadEnvFile('.env');
const localFull = loadEnvFile('.env.local-full');
const dockerKey = localFull.ENCRYPTION_KEY || '';
const postgresUser = localFull.POSTGRES_USER || primary.POSTGRES_USER;
const postgresPassword = localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD;
const postgresDb = localFull.POSTGRES_DB || primary.POSTGRES_DB;

const report = {
  gate: 'LPA-07B',
  sandboxAttestedFromPartnerPlatform: true,
  persistSkipped: true,
  deliverySkipped: true,
  emailSkipped: true,
};

if (!dockerKey || !postgresUser || !postgresPassword || !postgresDb) {
  report.stop = 'Local docker settings metadata missing. No token. No CREATE.';
  finish(report);
  process.exit(0);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:5433/${postgresDb}?schema=public`,
    },
  },
});

try {
  const row = await prisma.systemSetting.findUnique({
    where: { key: 'settings.provider.airalo' },
  });
  const value = row && typeof row.value === 'object' && row.value ? row.value : {};
  const updatedAt = row?.updatedAt ? new Date(row.updatedAt).toISOString() : null;
  const updatedMs = row?.updatedAt ? Date.parse(row.updatedAt) : 0;
  const clientId = value.clientIdEnc ? decryptRaw(value.clientIdEnc, dockerKey).trim() : '';
  const clientSecret = value.clientSecretEnc ? decryptRaw(value.clientSecretEnc, dockerKey).trim() : '';
  const idMeta = classifyPlain(clientId);
  const secretMeta = classifyPlain(clientSecret);
  let baseHost = 'missing';
  try {
    baseHost = new URL(String(value.baseUrl || `https://${ALLOWED_HOST}`)).host;
  } catch {
    baseHost = 'invalid';
  }

  report.preflight = {
    source: 'system_settings.settings.provider.airalo',
    db: '127.0.0.1:5433',
    updatedAt,
    newerThanLpa07a: updatedMs > PREVIOUS_UPDATED,
    baseHost,
    clientId: idMeta,
    clientSecret: { ...secretMeta, unusuallyShort: secretMeta.length > 0 && secretMeta.length < 16 },
    envOverride: false,
  };

  if (baseHost !== ALLOWED_HOST) {
    report.stop = 'Base host is not partners-api.airalo.com. No token. No CREATE.';
    finish(report);
  } else if (!report.preflight.newerThanLpa07a) {
    report.stop = 'Setting updatedAt was not newer than the LPA-07A email-shaped record. No token. No CREATE.';
    finish(report);
  } else if (idMeta.empty || secretMeta.empty || idMeta.looksMasked || secretMeta.looksMasked) {
    report.stop = 'Saved credential fields are empty or look masked. No token. No CREATE.';
    finish(report);
  } else if (idMeta.hasAt || secretMeta.hasAt) {
    report.stop = 'Saved values still contain @ and look like emails. No token. No CREATE.';
    finish(report);
  } else if (secretMeta.length < 16 || idMeta.length < 8) {
    report.stop = 'Saved values are still too short for Partner API credentials. No token. No CREATE.';
    finish(report);
  } else {
    const tokenBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });
    tokenCount += 1;
    const tokenRes = await airalo(`https://${ALLOWED_HOST}`, '', 'POST', '/v2/token', tokenBody.toString());
    report.tokenStatus = tokenRes.status;
    if (tokenRes.status !== 200) {
      report.tokenError = redactError(tokenRes.status, tokenRes.text);
      report.stop = 'Token failed. No CREATE.';
      finish(report);
    } else {
      const token = JSON.parse(tokenRes.text)?.data?.access_token;
      report.tokenOk = typeof token === 'string' && token.length > 0;
      if (!report.tokenOk) {
        report.stop = 'Token HTTP 200 but access_token missing. No CREATE.';
        finish(report);
      } else {
        const pkgRes = await airalo(`https://${ALLOWED_HOST}`, token, 'GET', '/v2/packages?limit=20&page=1');
        report.packagesStatus = pkgRes.status;
        if (pkgRes.status < 200 || pkgRes.status >= 300) {
          report.packagesError = redactError(pkgRes.status, pkgRes.text);
          report.stop = 'Catalog GET failed. No CREATE.';
          finish(report);
        } else {
          const countries = Array.isArray(JSON.parse(pkgRes.text)?.data) ? JSON.parse(pkgRes.text).data : [];
          let chosen = null;
          for (const country of countries) {
            for (const operator of Array.isArray(country?.operators) ? country.operators : []) {
              for (const pkg of Array.isArray(operator?.packages) ? operator.packages : []) {
                const id = typeof pkg?.id === 'string' ? pkg.id.trim() : '';
                const type = typeof pkg?.type === 'string' ? pkg.type : 'sim';
                if (!id || ERROR_PACKAGE.test(id) || type !== 'sim') continue;
                chosen = {
                  packageId: id,
                  title: typeof pkg.title === 'string' ? pkg.title : null,
                  country: typeof country.country_code === 'string' ? country.country_code : null,
                  reason: 'First non-error sim package from GET /v2/packages page 1.',
                };
                break;
              }
              if (chosen) break;
            }
            if (chosen) break;
          }
          report.package = chosen;
          if (!chosen) {
            report.stop = 'No valid catalog package_id. No CREATE.';
            finish(report);
          } else {
            const form = new FormData();
            form.set('package_id', chosen.packageId);
            form.set('quantity', '1');
            form.set('type', 'sim');
            createCount += 1;
            const createRes = await airalo(`https://${ALLOWED_HOST}`, token, 'POST', '/v2/orders', form);
            report.createStatus = createRes.status;
            if (createRes.status < 200 || createRes.status >= 300) {
              report.createError = redactError(createRes.status, createRes.text);
              report.stop = 'CREATE failed. No retry.';
              finish(report);
            } else {
              const created = JSON.parse(createRes.text)?.data ?? {};
              const sims = Array.isArray(created.sims) ? created.sims : [];
              const sim = sims[0] ?? {};
              const lpaClass = classifyLpa(sim);
              report.create = {
                idPresent: created.id != null,
                idType: typeof created.id,
                codePresent: typeof created.code === 'string' && created.code.length > 0,
                codeLooksDated: typeof created.code === 'string' && /^\d{8}-\d+$/.test(created.code),
                status: typeof created.status === 'string' ? created.status : created.status?.slug ?? null,
                simsCount: sims.length,
                hasIccid: Boolean(sim.iccid),
                hasQrcode: Boolean(sim.qrcode),
                hasLpa: Boolean(sim.lpa),
                hasMatchingId: Boolean(sim.matching_id),
                lpaClass,
                recognizedSandboxTest: lpaClass === 'sandbox_test',
              };
              if (typeof created.id === 'number' || (typeof created.id === 'string' && /^\d+$/.test(created.id))) {
                const recover = await airalo(
                  `https://${ALLOWED_HOST}`,
                  token,
                  'GET',
                  `/v2/orders/${created.id}?include=sims`,
                );
                report.recover = {
                  used: 'GET /v2/orders/{numeric_id}?include=sims',
                  status: recover.status,
                  recovered: recover.status >= 200 && recover.status < 300,
                };
              } else if (typeof created.code === 'string' && created.code) {
                const recover = await airalo(
                  `https://${ALLOWED_HOST}`,
                  token,
                  'GET',
                  `/v2/orders?filter[code]=${encodeURIComponent(created.code)}&include=sims`,
                );
                report.recover = {
                  used: 'GET /v2/orders?filter[code]=&include=sims',
                  status: recover.status,
                  recovered: recover.status >= 200 && recover.status < 300,
                };
              } else {
                report.recover = { used: 'none', recovered: false, reason: 'No identifier. No second CREATE.' };
              }
              report.persistReason = 'No CardOn order/quote write in this script.';
              report.emailTemplateNote = 'ESIM_READY templates omit LPA (unit-tested).';
              finish(report);
            }
          }
        }
      }
    }
  }
} catch (error) {
  report.failed = true;
  report.message = error instanceof Error ? error.message.slice(0, 180) : 'unknown';
  finish(report);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
