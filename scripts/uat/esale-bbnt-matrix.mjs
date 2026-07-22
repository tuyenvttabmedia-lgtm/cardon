#!/usr/bin/env node
/**
 * eSale BBNT denomination matrix UAT (Topup + ZING Card).
 *
 * Usage:
 *   node scripts/uat/esale-bbnt-matrix.mjs --mode=all --smoke
 *   node scripts/uat/esale-bbnt-matrix.mjs --mode=topup --telco=viettel
 *   node scripts/uat/esale-bbnt-matrix.mjs --mode=card --dry-run
 *   node scripts/uat/esale-bbnt-matrix.mjs --mode=low-balance
 *
 * Docs: docs/UAT_ESALE_BBNT_CHECKLIST.md
 *
 * Credentials: ENV ESALE_* or Prisma settings.provider.esale
 * Phones: ESALE_UAT_PHONE_VINA | _MOBI | _VIETTEL | _VIETNAMOBILE
 */
import { createDecipheriv, createHash, createPrivateKey, createSign } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = join(__dirname, 'reports');

/** BBNT Topup matrix (VND). */
const TOPUP_MATRIX = {
  vina: [5000, 10000, 20000, 25000, 30000, 50000, 100000, 200000, 300000, 500000, 1000000],
  mobi: [
    5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000,
    75000, 80000, 85000, 90000, 95000, 100000, 120000, 150000, 200000, 300000, 500000, 1000000,
    1005000,
  ],
  viettel: [
    5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 100000, 200000, 300000,
    500000, 1000000, 1005000,
  ],
  vietnamobile: [
    10000, 20000, 25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000, 75000, 80000,
    85000, 90000, 95000, 100000, 120000, 150000, 200000, 300000, 500000, 1000000, 1005000,
  ],
};

/** Dens eSale BBNT marked Failed ret_code 2. */
const EXPECTED_FAIL_TOPUP = new Set([
  'vina:1000000',
  'mobi:1005000',
  'viettel:1005000',
  'vietnamobile:1005000',
]);

/** BBNT ZING face values (VND). */
const ZING_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000, 1000000];

/** Fallback cardId when getcardlist missing (prod reference — sandbox may differ). */
const ZING_CARD_ID_FALLBACK = {
  10000: 49,
  20000: 1,
  50000: 50,
  100000: null,
  200000: null,
  500000: null,
  1000000: null,
};

const SMOKE_TOPUP = {
  vina: 10000,
  mobi: 10000,
  viettel: 10000,
  vietnamobile: 20000,
};
const SMOKE_ZING = 10000;

const LOW_BALANCE_AMOUNT = 99_999_999_000;

function parseArgs(argv) {
  const opts = {
    mode: 'all',
    smoke: false,
    dryRun: false,
    delayMs: 1500,
    telco: null,
    amounts: null,
  };
  for (const arg of argv) {
    if (arg === '--smoke') opts.smoke = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--mode=')) opts.mode = arg.slice(7);
    else if (arg.startsWith('--delay-ms=')) opts.delayMs = Number(arg.slice(11)) || 1500;
    else if (arg.startsWith('--telco=')) opts.telco = arg.slice(8).toLowerCase();
    else if (arg.startsWith('--amounts=')) {
      opts.amounts = arg
        .slice(10)
        .split(',')
        .map((s) => Number(s.trim().replace(/\./g, '')))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rsaSign(rawData, privateKeyPem) {
  const signer = createSign('RSA-SHA256');
  signer.update(rawData, 'utf8');
  signer.end();
  return signer.sign(createPrivateKey(privateKeyPem), 'base64');
}

function deriveEncryptionKey() {
  if (!process.env.ENCRYPTION_KEY) return null;
  return createHash('sha256').update(process.env.ENCRYPTION_KEY).digest();
}

function decryptSettingField(payload) {
  const key = deriveEncryptionKey();
  if (!key) throw new Error('ENCRYPTION_KEY required to decrypt settings');
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function formatTransDate(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function ensureTrailingSlash(url) {
  const u = (url ?? '').trim();
  if (!u) return '';
  return u.endsWith('/') ? u : `${u}/`;
}

async function resolveConfig() {
  let stored = {};
  if (process.env.DATABASE_URL && process.env.ENCRYPTION_KEY) {
    try {
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      const row = await prisma.systemSetting.findUnique({
        where: { key: 'settings.provider.esale' },
      });
      await prisma.$disconnect();
      if (row?.value && typeof row.value === 'object') stored = row.value;
    } catch (err) {
      console.warn('[warn] DB settings skip:', err.message);
    }
  }

  const cardApiUrl = ensureTrailingSlash(
    stored.cardApiUrl ?? process.env.ESALE_API_URL_CARD ?? '',
  );
  const topupApiUrl = ensureTrailingSlash(
    stored.topupApiUrl ?? process.env.ESALE_API_URL_TOPUP ?? '',
  );
  const agencyCode = stored.agencyCode ?? process.env.ESALE_AGENCY_CODE;
  const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
  const secretKey =
    (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
    process.env.ESALE_SECRET_KEY;
  const privateKeyPem = (
    (stored.privateKeyEnc ? decryptSettingField(stored.privateKeyEnc) : undefined) ??
    process.env.ESALE_PRIVATE_KEY ??
    ''
  )
    .replace(/\\n/g, '\n')
    .trim();

  return {
    cardApiUrl: cardApiUrl || 'https://partner3sb-esale.zing.vn/esale/cardshop/',
    topupApiUrl: topupApiUrl || 'https://partner3sb-esale.zing.vn/esale/mobiletopup/',
    agencyCode: agencyCode || '',
    clientCode: clientCode || '',
    secretKey: secretKey || '',
    privateKeyPem: privateKeyPem || '',
  };
}

function assertLiveCredentials(config) {
  const missing = [];
  if (!config.agencyCode) missing.push('ESALE_AGENCY_CODE');
  if (!config.clientCode) missing.push('ESALE_CLIENT_CODE');
  if (!config.secretKey) missing.push('ESALE_SECRET_KEY');
  if (!config.privateKeyPem) missing.push('ESALE_PRIVATE_KEY');
  if (missing.length) {
    throw new Error(`Missing credentials: ${missing.join(', ')}`);
  }
}

function resolvePhones() {
  return {
    vina: process.env.ESALE_UAT_PHONE_VINA?.trim() || '',
    mobi: process.env.ESALE_UAT_PHONE_MOBI?.trim() || '',
    viettel: process.env.ESALE_UAT_PHONE_VIETTEL?.trim() || '',
    vietnamobile: process.env.ESALE_UAT_PHONE_VIETNAMOBILE?.trim() || '',
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { retCode: response.status, retMsg: text.slice(0, 500) };
  }
  return { http: response.status, payload };
}

function signGetCardList(config, time) {
  return sha256Hex(`${config.agencyCode}|${time}|${config.secretKey}`);
}

function signGetBalanceCard(config, transId, time) {
  return sha256Hex(`${transId}|${config.agencyCode}|${time}|${config.secretKey}`);
}

function signGetBalanceTopup(config, time) {
  return sha256Hex(`${config.agencyCode}|${time}|${config.secretKey}`);
}

function signBuyCard(config, params) {
  const checkSum = sha256Hex(
    `${config.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}|${config.secretKey}`,
  );
  const rawData = `${config.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}${config.secretKey}`;
  return { checkSum, signature: rsaSign(rawData, config.privateKeyPem) };
}

function signTopup(config, params) {
  const checkSum = sha256Hex(
    `${config.agencyCode}|${params.transId}|${params.phoneNumber}|${params.amount}|${params.transDate}|${params.time}|${config.secretKey}`,
  );
  const rawData = `${config.agencyCode}|${params.transId}|${params.phoneNumber}|${params.amount}|${params.transDate}|${params.time}${config.secretKey}`;
  return { checkSum, signature: rsaSign(rawData, config.privateKeyPem) };
}

function faceValueOf(item) {
  const raw =
    item.unitPrice ?? item.faceValue ?? item.cardAmount ?? item.amount ?? item.menhGia ?? null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchZingCardMap(config) {
  const time = Math.floor(Date.now() / 1000).toString();
  const sig = signGetCardList(config, time);
  const { payload } = await postJson(`${config.cardApiUrl}getcardlist`, {
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    cardType: 'Game',
    time,
    sig,
  });

  const map = new Map();
  if (payload?.retCode !== 1 || !Array.isArray(payload?.data?.info)) {
    console.warn('[warn] getcardlist Game failed:', payload?.retCode, payload?.retMsg);
    return map;
  }

  for (const item of payload.data.info) {
    const supplier = String(item.supplierCode ?? item.supplier ?? '').toUpperCase();
    if (supplier !== 'ZING') continue;
    const face = faceValueOf(item);
    const cardId = Number(item.cardId ?? item.id);
    if (!face || !Number.isFinite(cardId)) continue;
    if (!map.has(face)) map.set(face, cardId);
  }
  return map;
}

async function getBalances(config) {
  const time = Math.floor(Date.now() / 1000).toString();
  const cardTransId = `BAL-C-${Date.now()}`;
  const card = await postJson(`${config.cardApiUrl}getbalance`, {
    transId: cardTransId,
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    time,
    sig: signGetBalanceCard(config, cardTransId, time),
  });
  const topupTime = Math.floor(Date.now() / 1000).toString();
  const topup = await postJson(`${config.topupApiUrl}getbalance`, {
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    time: topupTime,
    sig: signGetBalanceTopup(config, topupTime),
  });
  return {
    card: {
      retCode: card.payload?.retCode,
      balance: card.payload?.data?.balance,
      retMsg: card.payload?.retMsg,
    },
    topup: {
      retCode: topup.payload?.retCode,
      balance: topup.payload?.data?.balance,
      retMsg: topup.payload?.retMsg,
    },
  };
}

function classifyTopup(telco, amount, retCode) {
  const key = `${telco}:${amount}`;
  if (EXPECTED_FAIL_TOPUP.has(key)) {
    // BBNT notes ret_code 2; eSale may return -3005 or other invalid-amount codes.
    if (retCode === 1) return 'FAIL'; // unexpected success
    return 'EXPECTED_FAIL';
  }
  if (retCode === 1) return 'PASS';
  return 'FAIL';
}

function classifyCard(retCode) {
  return retCode === 1 ? 'PASS' : 'FAIL';
}

function classifyLowBalance(retCode) {
  return Number(retCode) === -3000 ? 'PASS' : 'FAIL';
}

function buildTopupJobs(opts, phones) {
  const jobs = [];
  const telcos = opts.telco ? [opts.telco] : Object.keys(TOPUP_MATRIX);
  for (const telco of telcos) {
    if (!TOPUP_MATRIX[telco]) {
      console.warn(`[warn] unknown telco ${telco}, skip`);
      continue;
    }
    let amounts = opts.smoke ? [SMOKE_TOPUP[telco]] : [...TOPUP_MATRIX[telco]];
    if (opts.amounts?.length) {
      const allow = new Set(opts.amounts);
      amounts = amounts.filter((a) => allow.has(a));
    }
    for (const amount of amounts) {
      jobs.push({
        kind: 'topup',
        telco,
        amount,
        phone: phones[telco] || '',
        expectedFail: EXPECTED_FAIL_TOPUP.has(`${telco}:${amount}`),
      });
    }
  }
  return jobs;
}

function buildCardJobs(opts, zingMap) {
  let amounts = opts.smoke ? [SMOKE_ZING] : [...ZING_AMOUNTS];
  if (opts.amounts?.length) {
    const allow = new Set(opts.amounts);
    amounts = amounts.filter((a) => allow.has(a));
  }
  return amounts.map((amount) => {
    const cardId = zingMap.get(amount) ?? ZING_CARD_ID_FALLBACK[amount] ?? null;
    return {
      kind: 'card',
      supplierCode: 'ZING',
      amount,
      cardId,
    };
  });
}

async function runTopup(config, job, dryRun) {
  const now = new Date();
  const time = Math.floor(now.getTime() / 1000).toString();
  const transDate = formatTransDate(now);
  const transId = `BBNT-T-${job.telco.toUpperCase()}-${job.amount}-${Date.now()}`;

  if (!job.phone) {
    return {
      ...job,
      transId,
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'Missing ESALE_UAT_PHONE_* for telco',
      eSaleTransId: null,
    };
  }

  if (dryRun) {
    return {
      ...job,
      transId,
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'dry-run',
      eSaleTransId: null,
    };
  }

  const { checkSum, signature } = signTopup(config, {
    transId,
    phoneNumber: job.phone,
    amount: job.amount,
    transDate,
    time,
  });

  const { payload } = await postJson(`${config.topupApiUrl}topup`, {
    transId,
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    phoneNumber: job.phone,
    telco: job.telco,
    amount: job.amount,
    transDate,
    time,
    checkSum,
    signature,
  });

  const retCode = payload?.retCode;
  return {
    ...job,
    transId,
    verdict: classifyTopup(job.telco, job.amount, retCode),
    retCode,
    retMsg: payload?.retMsg ?? null,
    eSaleTransId: payload?.data?.eSaleTransId ?? null,
    providerCode: payload?.data?.providerCode ?? null,
  };
}

async function runBuyCard(config, job, dryRun) {
  const now = new Date();
  const time = Math.floor(now.getTime() / 1000).toString();
  const transactionDate = formatTransDate(now);
  const transId = `BBNT-C-ZING-${job.amount}-${Date.now()}`;

  if (!job.cardId) {
    return {
      ...job,
      transId,
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'No cardId from getcardlist/fallback — map manually',
      eSaleTransId: null,
      hasCard: false,
    };
  }

  if (dryRun) {
    return {
      ...job,
      transId,
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'dry-run',
      eSaleTransId: null,
      hasCard: false,
    };
  }

  const quantity = 1;
  const { checkSum, signature } = signBuyCard(config, {
    transId,
    supplierCode: job.supplierCode,
    cardId: job.cardId,
    quantity,
    time,
  });

  const { payload } = await postJson(`${config.cardApiUrl}buycard`, {
    transId,
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    supplierCode: job.supplierCode,
    cardId: job.cardId,
    quantity,
    transactionDate,
    time,
    checkSum,
    signature,
  });

  const cards = payload?.data?.cardsList ?? payload?.data?.cards ?? [];
  const retCode = payload?.retCode;
  return {
    ...job,
    transId,
    verdict: classifyCard(retCode),
    retCode,
    retMsg: payload?.retMsg ?? null,
    eSaleTransId: payload?.data?.eSaleTransId ?? null,
    hasCard: Array.isArray(cards) && cards.length > 0,
    // Never print PIN / cardCode
    serialPreview: cards[0]?.serial ? String(cards[0].serial).slice(0, 4) + '…' : null,
  };
}

async function runLowBalance(config, phones, dryRun) {
  const results = [];
  const phone =
    phones.viettel || phones.mobi || phones.vina || phones.vietnamobile || '0900000000';
  const telco = phones.viettel
    ? 'viettel'
    : phones.mobi
      ? 'mobi'
      : phones.vina
        ? 'vina'
        : 'vietnamobile';

  const topupJob = {
    kind: 'topup-low-balance',
    telco,
    amount: LOW_BALANCE_AMOUNT,
    phone,
    expectedFail: true,
  };
  if (dryRun) {
    results.push({
      ...topupJob,
      transId: 'DRY',
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'dry-run',
    });
  } else {
    const now = new Date();
    const time = Math.floor(now.getTime() / 1000).toString();
    const transDate = formatTransDate(now);
    const transId = `BBNT-LB-T-${Date.now()}`;
    const { checkSum, signature } = signTopup(config, {
      transId,
      phoneNumber: phone,
      amount: LOW_BALANCE_AMOUNT,
      transDate,
      time,
    });
    const { payload } = await postJson(`${config.topupApiUrl}topup`, {
      transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      phoneNumber: phone,
      telco,
      amount: LOW_BALANCE_AMOUNT,
      transDate,
      time,
      checkSum,
      signature,
    });
    results.push({
      ...topupJob,
      transId,
      verdict: classifyLowBalance(payload?.retCode),
      retCode: payload?.retCode,
      retMsg: payload?.retMsg,
      eSaleTransId: payload?.data?.eSaleTransId ?? null,
    });
  }

  // Card low-balance: buy expensive ZING if mapped, else use huge quantity on known cardId
  const zingMap = dryRun ? new Map() : await fetchZingCardMap(config);
  const cardId = zingMap.get(1000000) ?? zingMap.get(500000) ?? ZING_CARD_ID_FALLBACK[10000] ?? 49;
  const cardJob = {
    kind: 'card-low-balance',
    supplierCode: 'ZING',
    amount: LOW_BALANCE_AMOUNT,
    cardId,
    quantity: 9999,
  };
  if (dryRun) {
    results.push({
      ...cardJob,
      transId: 'DRY',
      verdict: 'SKIP',
      retCode: null,
      retMsg: 'dry-run',
    });
  } else {
    const now = new Date();
    const time = Math.floor(now.getTime() / 1000).toString();
    const transactionDate = formatTransDate(now);
    const transId = `BBNT-LB-C-${Date.now()}`;
    const quantity = 9999;
    const { checkSum, signature } = signBuyCard(config, {
      transId,
      supplierCode: 'ZING',
      cardId,
      quantity,
      time,
    });
    const { payload } = await postJson(`${config.cardApiUrl}buycard`, {
      transId,
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      supplierCode: 'ZING',
      cardId,
      quantity,
      transactionDate,
      time,
      checkSum,
      signature,
    });
    results.push({
      ...cardJob,
      transId,
      verdict: classifyLowBalance(payload?.retCode),
      retCode: payload?.retCode,
      retMsg: payload?.retMsg,
      eSaleTransId: payload?.data?.eSaleTransId ?? null,
    });
  }

  return results;
}

function writeReports(meta, results) {
  mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(REPORT_DIR, `esale-bbnt-${stamp}`);

  const jsonPath = `${base}.json`;
  writeFileSync(jsonPath, JSON.stringify({ meta, results }, null, 2), 'utf8');

  const counts = { PASS: 0, FAIL: 0, EXPECTED_FAIL: 0, SKIP: 0 };
  for (const r of results) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;

  const lines = [
    '# eSale BBNT Matrix Report',
    '',
    `- Generated: ${meta.generatedAt}`,
    `- Mode: ${meta.mode} smoke=${meta.smoke} dryRun=${meta.dryRun}`,
    `- Balances before: card=${meta.balancesBefore?.card?.balance} topup=${meta.balancesBefore?.topup?.balance}`,
    `- Balances after: card=${meta.balancesAfter?.card?.balance} topup=${meta.balancesAfter?.topup?.balance}`,
    `- Counts: PASS=${counts.PASS} FAIL=${counts.FAIL} EXPECTED_FAIL=${counts.EXPECTED_FAIL} SKIP=${counts.SKIP}`,
    '',
    '| Kind | Telco/Supplier | Amount | cardId | Verdict | retCode | transId | eSaleTransId | Note |',
    '|------|----------------|--------|--------|---------|---------|---------|--------------|------|',
  ];

  for (const r of results) {
    lines.push(
      `| ${r.kind} | ${r.telco ?? r.supplierCode ?? ''} | ${r.amount ?? ''} | ${r.cardId ?? ''} | ${r.verdict} | ${r.retCode ?? ''} | ${r.transId ?? ''} | ${r.eSaleTransId ?? ''} | ${(r.retMsg ?? '').toString().replace(/\|/g, '/')} |`,
    );
  }

  lines.push('', 'Copy `transId` / `eSaleTransId` into BBNT column **Passed/Failed, Note mã GD**.', '');
  const mdPath = `${base}.md`;
  writeFileSync(mdPath, lines.join('\n'), 'utf8');

  return { jsonPath, mdPath, counts };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!['all', 'topup', 'card', 'low-balance'].includes(opts.mode)) {
    console.error('Invalid --mode. Use: all | topup | card | low-balance');
    process.exit(1);
  }

  console.log('[esale-bbnt] resolving config…');
  const config = await resolveConfig();
  if (!opts.dryRun) assertLiveCredentials(config);
  const phones = resolvePhones();

  console.log('[esale-bbnt] getbalance…');
  const balancesBefore = opts.dryRun
    ? { card: { balance: 'n/a' }, topup: { balance: 'n/a' } }
    : await getBalances(config);
  console.log(JSON.stringify({ balancesBefore }, null, 2));

  const results = [];

  if (opts.mode === 'low-balance') {
    results.push(...(await runLowBalance(config, phones, opts.dryRun)));
  } else {
    if (opts.mode === 'all' || opts.mode === 'topup') {
      const jobs = buildTopupJobs(opts, phones);
      console.log(`[esale-bbnt] topup jobs: ${jobs.length}`);
      for (const job of jobs) {
        const row = await runTopup(config, job, opts.dryRun);
        results.push(row);
        console.log(
          JSON.stringify({
            kind: row.kind,
            telco: row.telco,
            amount: row.amount,
            verdict: row.verdict,
            retCode: row.retCode,
            transId: row.transId,
          }),
        );
        if (!opts.dryRun) await sleep(opts.delayMs);
      }
    }

    if (opts.mode === 'all' || opts.mode === 'card') {
      const zingMap = opts.dryRun ? new Map() : await fetchZingCardMap(config);
      console.log(
        '[esale-bbnt] ZING cardId map:',
        Object.fromEntries([...zingMap.entries()].sort((a, b) => a[0] - b[0])),
      );
      const jobs = buildCardJobs(opts, zingMap);
      console.log(`[esale-bbnt] card jobs: ${jobs.length}`);
      for (const job of jobs) {
        const row = await runBuyCard(config, job, opts.dryRun);
        results.push(row);
        console.log(
          JSON.stringify({
            kind: row.kind,
            amount: row.amount,
            cardId: row.cardId,
            verdict: row.verdict,
            retCode: row.retCode,
            hasCard: row.hasCard,
            transId: row.transId,
          }),
        );
        if (!opts.dryRun) await sleep(opts.delayMs);
      }
    }
  }

  const balancesAfter = opts.dryRun
    ? balancesBefore
    : await getBalances(config);

  const meta = {
    generatedAt: new Date().toISOString(),
    mode: opts.mode,
    smoke: opts.smoke,
    dryRun: opts.dryRun,
    delayMs: opts.delayMs,
    telco: opts.telco,
    amounts: opts.amounts,
    balancesBefore,
    balancesAfter,
  };

  const { jsonPath, mdPath, counts } = writeReports(meta, results);
  console.log('[esale-bbnt] report:', mdPath);
  console.log('[esale-bbnt] json:', jsonPath);
  console.log('[esale-bbnt] counts:', counts);

  const hardFail = (counts.FAIL ?? 0) > 0;
  process.exit(hardFail ? 2 : 0);
}

main().catch((err) => {
  console.error('[esale-bbnt] fatal:', err);
  process.exit(1);
});
