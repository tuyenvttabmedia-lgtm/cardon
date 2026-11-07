/**
 * Review latest paid eSIM order. No secrets, LPA, tokens, or Airalo calls.
 */
import { createHash, createDecipheriv } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SANDBOX_LPA = /^LPA:1\$lpa\.airalo\.com\$TEST$/i;
const MOCK_MARKER = 'TEST-ESIM-NOT-REAL';

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
  if (host === 'lpa.airalo.com') return 'official_airalo_host';
  if (host.endsWith('.airalo.com')) return 'airalo_other';
  return 'other_host';
}

function classifySecret(secret) {
  const trimmed = secret.trim();
  const qrcode = trimmed.startsWith('LPA:1$') ? trimmed : '';
  const parts = qrcode ? qrcode.slice(6).split('$') : [];
  return {
    present: Boolean(trimmed),
    startsLpa1: trimmed.startsWith('LPA:1$'),
    exactOfficialTest: SANDBOX_LPA.test(trimmed),
    hasMockMarker: trimmed.includes(MOCK_MARKER) || trimmed.includes('MOCK'),
    partCount: parts.length,
    host: hostClass(parts[0]),
    matchingIsTest: (parts[1] || '').toUpperCase() === 'TEST',
    matchingLength: parts[1] ? parts[1].length : 0,
  };
}

function metaKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [];
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
  const order = await prisma.order.findFirst({
    where: {
      OR: [
        { orderCode: { contains: 'EDE902', mode: 'insensitive' } },
        { orderCode: { contains: 'EDE9002', mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      orderCode: true,
      channel: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      paymentGateway: true,
      paymentMethodCode: true,
      createdAt: true,
      updatedAt: true,
      orderItems: {
        select: {
          variant: { select: { type: true, name: true, sku: true } },
          esimQuote: {
            select: {
              providerProductCode: true,
              providerMode: true,
              providerCost: true,
            },
          },
          esimProfile: { select: { id: true, installSecretEnc: true, createdAt: true } },
          esimAttempts: {
            orderBy: { createdAt: 'asc' },
            select: {
              operation: true,
              outcome: true,
              providerReference: true,
              errorCode: true,
              errorMessage: true,
              safeRequestMeta: true,
              safeResponseMeta: true,
              createdAt: true,
              completedAt: true,
            },
          },
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: { status: true, gateway: true, amount: true, paidAt: true },
      },
      orderEvents: {
        orderBy: { createdAt: 'asc' },
        select: { eventType: true, createdAt: true },
      },
    },
  });

  if (!order) {
    console.log(JSON.stringify({ found: false }, null, 2));
  } else {
    const item = order.orderItems[0];
    const secret = item?.esimProfile?.installSecretEnc && dockerKey
      ? decryptRaw(item.esimProfile.installSecretEnc, dockerKey)
      : '';
    const attempts = (item?.esimAttempts ?? []).map((attempt) => ({
      operation: attempt.operation,
      outcome: attempt.outcome,
      hasReference: Boolean(attempt.providerReference),
      referenceLooksDated: typeof attempt.providerReference === 'string' && /^\d{8}-\d+$/.test(attempt.providerReference),
      referenceLooksNumeric: typeof attempt.providerReference === 'string' && /^\d+$/.test(attempt.providerReference),
      errorCode: attempt.errorCode,
      hasError: Boolean(attempt.errorMessage),
      requestMetaKeys: metaKeys(attempt.safeRequestMeta),
      responseMetaKeys: metaKeys(attempt.safeResponseMeta),
      createdAt: attempt.createdAt.toISOString(),
      completedAt: attempt.completedAt ? attempt.completedAt.toISOString() : null,
    }));
    console.log(JSON.stringify({
      found: true,
      orderCode: order.orderCode,
      channel: order.channel,
      paymentStatus: order.paymentStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      paymentGateway: order.paymentGateway,
      paymentMethodCode: order.paymentMethodCode,
      createdAt: order.createdAt.toISOString(),
      variantType: item?.variant?.type ?? null,
      variantName: item?.variant?.name ?? null,
      sku: item?.variant?.sku ?? null,
      quote: item?.esimQuote
        ? {
            providerProductCode: item.esimQuote.providerProductCode,
            providerMode: item.esimQuote.providerMode,
            hasProviderCost: item.esimQuote.providerCost != null,
          }
        : null,
      payments: order.payments.map((payment) => ({
        status: payment.status,
        gateway: payment.gateway,
        amount: payment.amount?.toString(),
        paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      })),
      events: order.orderEvents.map((event) => event.eventType),
      attemptCount: attempts.length,
      attempts,
      profile: {
        present: Boolean(item?.esimProfile),
        createdAt: item?.esimProfile?.createdAt?.toISOString() ?? null,
        secret: classifySecret(secret),
      },
      flagsFromCompose: {
        note: 'docker-compose.local-full.yml',
        esimProviderMode: 'live',
        esimLiveArm: true,
      },
    }, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
