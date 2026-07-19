#!/usr/bin/env node
/** Probe eSale cardshop/topupdata endpoint for direct DATA topup. */
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

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json().catch(async () => ({ retMsg: await response.text(), retCode: response.status }));
}

async function main() {
  const config = await resolveConfig();
  const now = new Date();
  const ctx = {
    transId: `PROBE-TD-${Date.now()}`,
    phoneNumber: '0985663225',
    packageCode: 'DW12',
    amount: 12000,
    telco: 'viettel',
    supplierCode: 'VIETTEL3G',
    cardId: 606,
    transDate: formatTransDate(now),
    time: Math.floor(now.getTime() / 1000).toString(),
    quantity: 1,
  };

  const { agencyCode, clientCode, secretKey, privateKeyPem } = config;

  const signTopup = (parts) => {
    const checkSum = sha256Hex([...parts, secretKey].join('|'));
    const rawData = `${parts.join('|')}${secretKey}`;
    return { checkSum, signature: rsaSign(rawData, privateKeyPem) };
  };

  const signBuyCard = () => {
    const parts = [agencyCode, ctx.transId, ctx.supplierCode, ctx.cardId, ctx.quantity, ctx.time];
    const checkSum = sha256Hex([...parts, secretKey].join('|'));
    const rawData = `${parts.join('|')}${secretKey}`;
    return { checkSum, signature: rsaSign(rawData, privateKeyPem) };
  };

  const attempts = [
    {
      label: 'topup sig phone+amount',
      sig: signTopup([agencyCode, ctx.transId, ctx.phoneNumber, ctx.amount, ctx.transDate, ctx.time]),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        phoneNumber: ctx.phoneNumber,
        telco: ctx.telco,
        amount: ctx.amount,
        packageCode: ctx.packageCode,
        transDate: ctx.transDate,
        time: ctx.time,
      },
    },
    {
      label: 'topup sig phone+packageCode+amount',
      sig: signTopup([
        agencyCode,
        ctx.transId,
        ctx.phoneNumber,
        ctx.packageCode,
        ctx.amount,
        ctx.transDate,
        ctx.time,
      ]),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        phoneNumber: ctx.phoneNumber,
        telco: ctx.telco,
        packageCode: ctx.packageCode,
        amount: ctx.amount,
        transDate: ctx.transDate,
        time: ctx.time,
      },
    },
    {
      label: 'buycard sig + phone + cardId',
      sig: signBuyCard(),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        supplierCode: ctx.supplierCode,
        cardId: ctx.cardId,
        quantity: ctx.quantity,
        phoneNumber: ctx.phoneNumber,
        transactionDate: ctx.transDate,
        time: ctx.time,
      },
    },
    {
      label: 'buycard sig + phone only no cardId',
      sig: signTopup([agencyCode, ctx.transId, ctx.supplierCode, ctx.cardId, ctx.quantity, ctx.time]),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        supplierCode: ctx.supplierCode,
        cardId: ctx.cardId,
        quantity: ctx.quantity,
        phoneNumber: ctx.phoneNumber,
        transactionDate: ctx.transDate,
        time: ctx.time,
      },
    },
    {
      label: 'package sig phone+package only',
      sig: signTopup([
        agencyCode,
        ctx.transId,
        ctx.phoneNumber,
        ctx.packageCode,
        ctx.transDate,
        ctx.time,
      ]),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        phoneNumber: ctx.phoneNumber,
        telco: ctx.telco,
        packageCode: ctx.packageCode,
        transDate: ctx.transDate,
        time: ctx.time,
      },
    },
    {
      label: 'cardId sig phone+cardId',
      sig: signTopup([
        agencyCode,
        ctx.transId,
        ctx.phoneNumber,
        ctx.cardId,
        ctx.transDate,
        ctx.time,
      ]),
      body: {
        transId: ctx.transId,
        agencyCode,
        clientCode,
        phoneNumber: ctx.phoneNumber,
        supplierCode: ctx.supplierCode,
        cardId: ctx.cardId,
        transDate: ctx.transDate,
        time: ctx.time,
      },
    },
  ];

  for (const attempt of attempts) {
    const payload = await post(`${config.cardApiUrl}topupdata`, {
      ...attempt.body,
      checkSum: attempt.sig.checkSum,
      signature: attempt.sig.signature,
    });
    console.log(
      JSON.stringify({
        label: attempt.label,
        retCode: payload.retCode,
        retMsg: payload.retMsg,
        providerCode: payload.data?.providerCode,
      }),
    );
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
