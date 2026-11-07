/**
 * LPA-07: at most one Airalo Sandbox CREATE. Stops if Sandbox mode is not proven.
 * Does not print credentials, tokens, LPA, QR, or raw bodies.
 */
import { createHash, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ALLOWED_HOST = 'partners-api.airalo.com';
const SANDBOX_LPA = /^LPA:1\$lpa\.airalo\.com\$TEST$/i;
const ERROR_PACKAGE = /^test-(insufficient-balance|maintenance-mode|disabled-top-up|not-enough|out-of-stock|create-)/i;
let createCount = 0;

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

function parseDb(url) {
  const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
  return { host: parsed.hostname, port: parsed.port || '5432' };
}

function decryptField(payload, encryptionKey) {
  if (!payload || !encryptionKey) return '';
  const [ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) return '';
  const key = createHash('sha256').update(encryptionKey).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8').trim();
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
      field: parsed.data && typeof parsed.data === 'object' ? Object.keys(parsed.data)[0] ?? null : null,
    };
  } catch {
    return { status, code: null, field: null, unreadable: true };
  }
}

async function readLocalAiralo() {
  const primary = loadEnvFile('.env');
  const localFull = loadEnvFile('.env.local-full');
  const keys = [...new Set([primary.ENCRYPTION_KEY, localFull.ENCRYPTION_KEY].filter(Boolean))];
  const candidates = [];
  if (primary.DATABASE_URL) {
    const db = parseDb(primary.DATABASE_URL);
    if (db.host === 'localhost' || db.host === '127.0.0.1') {
      candidates.push({ label: '.env DATABASE_URL', url: primary.DATABASE_URL, host: db.host, port: db.port });
    }
  }
  const postgresUser = localFull.POSTGRES_USER || primary.POSTGRES_USER;
  const postgresPassword = localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD;
  const postgresDb = localFull.POSTGRES_DB || primary.POSTGRES_DB;
  if (postgresUser && postgresPassword && postgresDb) {
    const url = `postgresql://${postgresUser}:${postgresPassword}@127.0.0.1:5433/${postgresDb}?schema=public`;
    candidates.push({ label: 'docker localhost:5433', url, host: '127.0.0.1', port: '5433' });
  }

  const attempts = [];
  for (const candidate of candidates) {
    const prisma = new PrismaClient({ datasources: { db: { url: candidate.url } } });
    try {
      const row = await prisma.systemSetting.findUnique({
        where: { key: 'settings.provider.airalo' },
      });
      const value = row && typeof row.value === 'object' && row.value ? row.value : {};
      let clientId = '';
      let clientSecret = '';
      for (const encryptionKey of keys) {
        clientId = decryptField(value.clientIdEnc, encryptionKey);
        clientSecret = decryptField(value.clientSecretEnc, encryptionKey);
        if (clientId && clientSecret) break;
      }
      clientId = clientId || primary.AIRALO_CLIENT_ID || localFull.AIRALO_CLIENT_ID || '';
      clientSecret = clientSecret || primary.AIRALO_CLIENT_SECRET || localFull.AIRALO_CLIENT_SECRET || '';
      const baseUrl = String(value.baseUrl || primary.AIRALO_BASE_URL || localFull.AIRALO_BASE_URL || `https://${ALLOWED_HOST}`).replace(/\/$/, '');
      await prisma.$disconnect();
      attempts.push({
        source: candidate.label,
        connected: true,
        settingPresent: Boolean(row),
        hasEncFields: Boolean(value.clientIdEnc && value.clientSecretEnc),
        decrypted: Boolean(clientId && clientSecret),
      });
      if (!clientId || !clientSecret) continue;
      return {
        source: candidate.label,
        dbHost: candidate.host,
        dbPort: candidate.port,
        configured: true,
        clientId,
        clientSecret,
        baseUrl,
        clientIdLength: clientId.length,
        attempts,
      };
    } catch (error) {
      attempts.push({
        source: candidate.label,
        connected: false,
        errorName: error instanceof Error ? error.name : 'Error',
      });
      await prisma.$disconnect().catch(() => undefined);
    }
  }
  return {
    source: 'none',
    dbHost: null,
    dbPort: null,
    configured: false,
    clientId: '',
    clientSecret: '',
    baseUrl: `https://${ALLOWED_HOST}`,
    attempts,
  };
}

async function airalo(baseUrl, token, method, path, body) {
  const headers = {
    Accept: 'application/json',
    'Accept-Language': 'vi',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (typeof body === 'string') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = body;
  }
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return { status: response.status, text };
}

async function main() {
  const report = {
    gate: 'LPA-07',
    sandboxConfirmed: false,
    createCount: 0,
    stoppedBeforeCreate: true,
    persistSkipped: true,
    deliverySkipped: true,
    emailSkipped: true,
  };

  const airaloCreds = await readLocalAiralo();
  let baseHost = 'invalid';
  try {
    baseHost = new URL(airaloCreds.baseUrl).host;
  } catch {
    baseHost = 'invalid';
  }
  report.config = {
    credentialSource: airaloCreds.source,
    dbHost: airaloCreds.dbHost,
    dbPort: airaloCreds.dbPort,
    localhostDb: airaloCreds.dbHost === 'localhost' || airaloCreds.dbHost === '127.0.0.1',
    airaloHost: baseHost,
    credentialsPresent: airaloCreds.configured,
    clientIdLength: airaloCreds.clientIdLength ?? 0,
    liveFlagsNotChanged: true,
    settingAttempts: airaloCreds.attempts ?? [],
  };

  if (!report.config.localhostDb) {
    report.stop = 'DATABASE is not a verified localhost host. No Airalo call.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (baseHost !== ALLOWED_HOST) {
    report.stop = 'Airalo base host is not partners-api.airalo.com. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!airaloCreds.configured) {
    report.stop = 'Airalo credentials were not found in localhost settings or env. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const tokenBody = new URLSearchParams({
    client_id: airaloCreds.clientId,
    client_secret: airaloCreds.clientSecret,
    grant_type: 'client_credentials',
  });
  const tokenRes = await airalo(airaloCreds.baseUrl, '', 'POST', '/v2/token', tokenBody.toString());
  report.tokenStatus = tokenRes.status;
  if (tokenRes.status < 200 || tokenRes.status >= 300) {
    report.stop = 'Token request failed. No CREATE.';
    report.tokenError = redactError(tokenRes.status, tokenRes.text);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const tokenJson = JSON.parse(tokenRes.text);
  const token = tokenJson?.data?.access_token;
  if (typeof token !== 'string' || !token) {
    report.stop = 'Token response had no access_token. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const listRes = await airalo(
    airaloCreds.baseUrl,
    token,
    'GET',
    '/v2/orders?include=sims&limit=5&page=1',
  );
  report.existingOrdersStatus = listRes.status;
  if (listRes.status < 200 || listRes.status >= 300) {
    report.stop = 'Could not read existing orders to prove Sandbox mode. No CREATE.';
    report.existingOrdersError = redactError(listRes.status, listRes.text);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const listJson = JSON.parse(listRes.text);
  const rows = Array.isArray(listJson?.data) ? listJson.data : [];
  const classes = [];
  for (const row of rows) {
    const sims = Array.isArray(row?.sims) ? row.sims : [];
    if (sims.length === 0) classes.push('no_sims');
    for (const sim of sims) classes.push(classifyLpa(sim));
  }
  report.existingOrderCount = rows.length;
  report.existingSimClasses = classes;
  const hasSandbox = classes.includes('sandbox_test');
  const hasProdLike = classes.includes('not_sandbox_test');
  if (hasProdLike) {
    report.stop = 'Existing order sims do not look like Sandbox TEST LPA. Account may be Production. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (!hasSandbox) {
    report.stop = 'No existing Sandbox TEST LPA found. Cannot prove Sandbox mode. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  report.sandboxConfirmed = true;
  report.sandboxProof = 'Existing GET /v2/orders sims classified as sandbox_test (official TEST LPA shape).';

  const pkgRes = await airalo(airaloCreds.baseUrl, token, 'GET', '/v2/packages?limit=20&page=1');
  report.packagesStatus = pkgRes.status;
  if (pkgRes.status < 200 || pkgRes.status >= 300) {
    report.stop = 'Catalog GET failed. No CREATE.';
    report.packagesError = redactError(pkgRes.status, pkgRes.text);
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const pkgJson = JSON.parse(pkgRes.text);
  const countries = Array.isArray(pkgJson?.data) ? pkgJson.data : [];
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
          reason: 'First non-error sim package from GET /v2/packages page 1, not a guessed id.',
        };
        break;
      }
      if (chosen) break;
    }
    if (chosen) break;
  }
  report.package = chosen;
  if (!chosen) {
    report.stop = 'No valid catalog package_id on page 1. No CREATE.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const form = new FormData();
  form.set('package_id', chosen.packageId);
  form.set('quantity', '1');
  form.set('type', 'sim');
  createCount += 1;
  const createRes = await airalo(airaloCreds.baseUrl, token, 'POST', '/v2/orders', form);
  report.createCount = createCount;
  report.stoppedBeforeCreate = false;
  report.createStatus = createRes.status;
  if (createRes.status < 200 || createRes.status >= 300) {
    report.createError = redactError(createRes.status, createRes.text);
    report.stop = 'CREATE failed. No retry.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
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
  if (lpaClass === 'not_sandbox_test') {
    report.stop = 'CREATE response does not look like Sandbox TEST data. Stopping. No further mutation.';
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (typeof created.id === 'number' || (typeof created.id === 'string' && /^\d+$/.test(created.id))) {
    const recover = await airalo(airaloCreds.baseUrl, token, 'GET', `/v2/orders/${created.id}?include=sims`);
    report.recover = {
      used: 'GET /v2/orders/{numeric_id}?include=sims',
      status: recover.status,
      recovered: recover.status >= 200 && recover.status < 300,
    };
  } else if (typeof created.code === 'string' && created.code) {
    const recover = await airalo(
      airaloCreds.baseUrl,
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
    report.recover = { used: 'none', status: null, recovered: false, reason: 'No identifier. No second CREATE.' };
  }

  report.persistSkipped = true;
  report.persistReason = 'No CardOn order/quote write. Would require local order + payment path.';
  report.deliverySkipped = true;
  report.emailSkipped = true;
  report.emailTemplateNote = 'ESIM_READY / ESIM_TEST_READY templates already omit LPA (unit-tested).';
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.log(
    JSON.stringify(
      {
        gate: 'LPA-07',
        failed: true,
        createCount,
        message: error instanceof Error ? error.message.slice(0, 180) : 'unknown',
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
