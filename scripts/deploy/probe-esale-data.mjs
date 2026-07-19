#!/usr/bin/env node
/**
 * Probe eSale DATA API variants (sandbox-safe: unique transId, invalid phone).
 * Usage: docker exec cardon-prod-api node /app/scripts/deploy/probe-esale-data.mjs
 */
import { createDecipheriv, createHash, createPrivateKey, createSign } from 'node:crypto';

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function rsaSign(rawData, privateKeyPem) {
  const signer = createSign('RSA-SHA256');
  signer.update(rawData, 'utf8');
  signer.end();
  return signer.sign(createPrivateKey(privateKeyPem), 'base64');
}

function formatTransDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

async function resolveConfig() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const row = await prisma.systemSetting.findUnique({
      where: { key: 'settings.provider.esale' },
    });
    const stored =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value) ? row.value : {};

    const topupApiUrlRaw =
      stored.topupApiUrl ?? process.env.ESALE_API_URL_TOPUP ?? process.env.ESALE_API_URL;
    const topupApiUrl = topupApiUrlRaw ? `${topupApiUrlRaw.replace(/\/$/, '')}/` : '';
    const agencyCode =
      stored.agencyCode ?? process.env.ESALE_AGENCY_CODE ?? process.env.ESALE_PARTNER_ID;
    const clientCode = stored.clientCode ?? process.env.ESALE_CLIENT_CODE;
    const secretKey =
      (stored.secretKeyEnc ? decryptSettingField(stored.secretKeyEnc) : undefined) ??
      process.env.ESALE_SECRET_KEY ??
      process.env.ESALE_PARTNER_KEY;
    const privateKeyPem = (
      (stored.privateKeyEnc ? decryptSettingField(stored.privateKeyEnc) : undefined) ??
      process.env.ESALE_PRIVATE_KEY ??
      ''
    )
      .replace(/\\n/g, '\n')
      .trim();

    if (!topupApiUrl || !agencyCode || !clientCode || !secretKey || !privateKeyPem) {
      throw new Error('Missing eSale config (DB or env)');
    }

    return { topupApiUrl, agencyCode, clientCode, secretKey, privateKeyPem };
  } finally {
    await prisma.$disconnect();
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return { http: response.status, body: JSON.parse(text) };
  } catch {
    return { http: response.status, body: text.slice(0, 200) };
  }
}

function buildAttempts(config, ctx) {
  const { agencyCode, clientCode, secretKey, privateKeyPem } = config;
  const { transId, phoneNumber, packageCode, amount, telco, transDate, time } = ctx;

  const signTopupStyle = (includePackageInSig) => {
    const sigParts = includePackageInSig
      ? [agencyCode, transId, phoneNumber, packageCode, amount, transDate, time]
      : [agencyCode, transId, phoneNumber, amount, transDate, time];
    const checkSum = sha256Hex([...sigParts, secretKey].join('|'));
    const rawData = `${sigParts.join('|')}${secretKey}`;
    const signature = rsaSign(rawData, privateKeyPem);
    return { checkSum, signature };
  };

  const signPackageOnly = () => {
    const parts = [agencyCode, transId, phoneNumber, packageCode, transDate, time];
    const checkSum = sha256Hex([...parts, secretKey].join('|'));
    const rawData = `${parts.join('|')}${secretKey}`;
    return { checkSum, signature: rsaSign(rawData, privateKeyPem) };
  };

  const base = {
    transId,
    agencyCode,
    clientCode,
    phoneNumber,
    telco,
    packageCode,
    amount,
    transDate,
    time,
  };

  return [
    {
      label: 'topup valid viettel 10000 control',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const ctrlAmount = 10000;
        const checkSum = sha256Hex(
          [agencyCode, transId, phoneNumber, ctrlAmount, transDate, time, secretKey].join('|'),
        );
        const rawData = `${agencyCode}|${transId}|${phoneNumber}|${ctrlAmount}|${transDate}|${time}${secretKey}`;
        const signature = rsaSign(rawData, privateKeyPem);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount: ctrlAmount, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup cardCode DW12 field',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount, cardCode: packageCode, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup supplierCode+cardId VIETTEL3G:606',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount, supplierCode: 'VIETTEL3G', cardId: 606, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup amount only 12000',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return { transId, agencyCode, clientCode, phoneNumber, telco, amount, transDate, time, checkSum, signature };
      })(),
    },
    {
      label: 'topup + packageCode field, topup sig',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return { ...base, checkSum, signature };
      })(),
    },
    {
      label: 'topup packageCode lowercase',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return { ...base, packageCode: packageCode.toLowerCase(), checkSum, signature };
      })(),
    },
    {
      label: 'topup dataCode field',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount, dataCode: packageCode, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup productCode field',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount, productCode: packageCode, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup package field',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, amount, package: packageCode, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup no amount body, packageCode only extra',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return {
          transId, agencyCode, clientCode, phoneNumber, telco, packageCode, transDate, time, checkSum, signature,
        };
      })(),
    },
    {
      label: 'topup telco empty auto-detect',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(false);
        return { ...base, telco: '', checkSum, signature };
      })(),
    },
    {
      label: 'topup + packageCode, sig includes packageCode',
      url: `${config.topupApiUrl}topup`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(true);
        return { ...base, checkSum, signature };
      })(),
    },
    {
      label: 'topupdata + package sig (with amount)',
      url: `${config.topupApiUrl}topupdata`,
      body: (() => {
        const { checkSum, signature } = signTopupStyle(true);
        return { ...base, checkSum, signature };
      })(),
    },
    {
      label: 'topupdata package-only sig',
      url: `${config.topupApiUrl}topupdata`,
      body: (() => {
        const { checkSum, signature } = signPackageOnly();
        return { ...base, checkSum, signature };
      })(),
    },
    {
      label: 'topupdata no amount in body',
      url: `${config.topupApiUrl}topupdata`,
      body: (() => {
        const { checkSum, signature } = signPackageOnly();
        const { amount: _a, ...rest } = base;
        return { ...rest, checkSum, signature };
      })(),
    },
  ];
}

async function probeListEndpoints(config) {
  const time = Math.floor(Date.now() / 1000).toString();
  const sig = sha256Hex(`${config.agencyCode}|${time}|${config.secretKey}`);
  const endpoints = ['getdatalist', 'getpackagelist', 'gettopupdata', 'getdatapackage'];
  for (const endpoint of endpoints) {
    const result = await postJson(`${config.topupApiUrl}${endpoint}`, {
      agencyCode: config.agencyCode,
      clientCode: config.clientCode,
      time,
      sig,
    });
    console.log(
      JSON.stringify({
        label: `list ${endpoint}`,
        retCode: result.body?.retCode,
        retMsg: result.body?.retMsg,
        http: result.http,
        sample: result.body?.data ? Object.keys(result.body.data) : result.body,
      }),
    );
  }
}

async function main() {
  const config = await resolveConfig();
  const now = new Date();
  const ctx = {
    transId: `PROBE-${Date.now()}`,
    phoneNumber: '0985663225',
    packageCode: 'DW12',
    amount: 12000,
    telco: 'viettel',
    transDate: formatTransDate(now),
    time: Math.floor(now.getTime() / 1000).toString(),
  };

  console.log(JSON.stringify({ topupApiUrl: config.topupApiUrl, ctx }, null, 2));

  await probeListEndpoints(config);

  for (const attempt of buildAttempts(config, ctx)) {
    const result = await postJson(attempt.url, attempt.body);
    const ret = result.body?.retCode ?? result.body?.retMsg ?? result.body;
    console.log(
      JSON.stringify({
        label: attempt.label,
        url: attempt.url,
        http: result.http,
        retCode: result.body?.retCode,
        retMsg: result.body?.retMsg,
        ret,
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
