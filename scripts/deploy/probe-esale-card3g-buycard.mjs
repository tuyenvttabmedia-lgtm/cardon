#!/usr/bin/env node
/** Probe eSale Card3G buycard with phone for direct DATA topup. */
import { createDecipheriv, createHash, createPrivateKey, createSign } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function resolveConfig() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'settings.provider.esale' } });
  const stored = row?.value && typeof row.value === 'object' ? row.value : {};
  const cardApiUrl = `${(stored.cardApiUrl ?? process.env.ESALE_API_URL_CARD).replace(/\/$/, '')}/`;
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
  return { cardApiUrl, agencyCode, clientCode, secretKey, privateKeyPem };
}

function formatTransDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function signBuyCard(config, params) {
  const checkSum = sha256Hex(
    `${config.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}|${config.secretKey}`,
  );
  const rawData = `${config.agencyCode}|${params.transId}|${params.supplierCode}|${params.cardId}|${params.quantity}|${params.time}${config.secretKey}`;
  const signature = rsaSign(rawData, config.privateKeyPem);
  return { checkSum, signature };
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(async () => ({ text: await response.text() }));
  return { http: response.status, payload };
}

async function main() {
  const config = await resolveConfig();
  const now = new Date();
  const time = Math.floor(now.getTime() / 1000).toString();
  const transDate = formatTransDate(now);
  const transId = `PROBE-C3G-${Date.now()}`;
  const phoneNumber = '0985663225';
  const base = {
    transId,
    agencyCode: config.agencyCode,
    clientCode: config.clientCode,
    supplierCode: 'VIETTEL3G',
    cardId: 606,
    quantity: 1,
    transactionDate: transDate,
    time,
  };
  const { checkSum, signature } = signBuyCard(config, base);

  const attempts = [
    { label: 'buycard plain', body: { ...base, checkSum, signature } },
    { label: 'buycard + phoneNumber', body: { ...base, phoneNumber, checkSum, signature } },
    { label: 'buycard + targetPhone', body: { ...base, targetPhone: phoneNumber, checkSum, signature } },
    { label: 'buycard + msisdn', body: { ...base, msisdn: phoneNumber, checkSum, signature } },
  ];

  for (const attempt of attempts) {
    const result = await post(`${config.cardApiUrl}buycard`, attempt.body);
    console.log(
      JSON.stringify({
        label: attempt.label,
        retCode: result.payload?.retCode,
        retMsg: result.payload?.retMsg,
        hasCards: Boolean(result.payload?.data?.cardsList?.length),
      }),
    );
  }

  const endpoints = ['topup3g', 'topupcard3g', 'buycard3g', 'directtopup', 'topupdata'];
  for (const endpoint of endpoints) {
    const sigParts = signBuyCard(config, base);
    const result = await post(`${config.cardApiUrl}${endpoint}`, {
      ...base,
      phoneNumber,
      checkSum: sigParts.checkSum,
      signature: sigParts.signature,
    });
    console.log(
      JSON.stringify({
        label: `cardshop/${endpoint}`,
        http: result.http,
        retCode: result.payload?.retCode,
        retMsg: result.payload?.retMsg ?? result.payload?.text?.slice?.(0, 80),
      }),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
