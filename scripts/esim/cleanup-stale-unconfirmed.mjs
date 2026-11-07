/**
 * Localhost cleanup: leftover UNCONFIRMED on saved profiles + missing timeline events.
 * No secrets, LPA, tokens, or Airalo calls.
 */
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

function asMeta(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...value }
    : {};
}

const primary = loadEnvFile('.env');
const localFull = loadEnvFile('.env.local-full');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${localFull.POSTGRES_USER || primary.POSTGRES_USER}:${localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD}@127.0.0.1:5433/${localFull.POSTGRES_DB || primary.POSTGRES_DB}?schema=public`,
    },
  },
});

try {
  const stale = await prisma.esimProviderAttempt.findMany({
    where: {
      outcome: 'PROFILE_SAVED',
      OR: [
        { errorCode: 'UNCONFIRMED' },
        { errorMessage: { contains: 'No second CREATE' } },
      ],
    },
    select: {
      id: true,
      safeRequestMeta: true,
      safeResponseMeta: true,
      orderItem: {
        select: {
          order: { select: { orderCode: true } },
          esimQuote: { select: { providerMode: true } },
        },
      },
    },
  });

  const cleaned = [];
  for (const row of stale) {
    const live = row.orderItem.esimQuote?.providerMode === 'LIVE';
    const request = asMeta(row.safeRequestMeta);
    const response = asMeta(row.safeResponseMeta);
    await prisma.esimProviderAttempt.update({
      where: { id: row.id },
      data: {
        errorCode: null,
        errorMessage: null,
        safeRequestMeta: {
          ...request,
          source: live ? 'airalo' : 'mock',
          testData: !live,
        },
        safeResponseMeta: {
          ...response,
          stored: true,
          source: live ? 'airalo' : 'mock',
          testData: !live,
        },
      },
    });
    cleaned.push(row.orderItem.order.orderCode);
  }

  const completed = await prisma.order.findMany({
    where: {
      fulfillmentStatus: 'COMPLETED',
      orderItems: { some: { variant: { type: 'ESIM' }, esimProfile: { isNot: null } } },
    },
    select: {
      id: true,
      orderCode: true,
      orderEvents: { select: { eventType: true } },
      orderItems: {
        where: { variant: { type: 'ESIM' } },
        select: {
          esimQuote: { select: { providerMode: true } },
          esimProfile: { select: { createdAt: true } },
          esimAttempts: {
            where: { operation: 'CREATE' },
            orderBy: { createdAt: 'asc' },
            take: 1,
            select: { createdAt: true, completedAt: true },
          },
        },
      },
    },
  });

  const backfilled = [];
  for (const order of completed) {
    const types = new Set(order.orderEvents.map((event) => event.eventType));
    const item = order.orderItems[0];
    const attempt = item?.esimAttempts[0];
    const profileAt = item?.esimProfile?.createdAt ?? attempt?.completedAt ?? attempt?.createdAt;
    const requestAt = attempt?.createdAt ?? profileAt;
    if (!profileAt || !requestAt) continue;
    const live = item?.esimQuote?.providerMode === 'LIVE';
    const rows = [];
    if (!types.has('PROVIDER_REQUEST')) {
      rows.push({
        orderId: order.id,
        eventType: 'PROVIDER_REQUEST',
        message: live ? 'Airalo CREATE started' : 'eSIM mock CREATE started',
        createdAt: requestAt,
        metadata: { backfill: true },
      });
    }
    if (!types.has('PROVIDER_SUCCESS')) {
      rows.push({
        orderId: order.id,
        eventType: 'PROVIDER_SUCCESS',
        message: live
          ? 'Airalo LPA stored; install not confirmed'
          : 'eSIM mock profile stored',
        createdAt: profileAt,
        metadata: { backfill: true },
      });
    }
    if (!types.has('ORDER_DELIVERED')) {
      rows.push({
        orderId: order.id,
        eventType: 'ORDER_DELIVERED',
        message: 'eSIM install profile stored',
        createdAt: profileAt,
        metadata: { backfill: true },
      });
    }
    if (rows.length === 0) continue;
    await prisma.orderEvent.createMany({ data: rows });
    backfilled.push({ orderCode: order.orderCode, events: rows.map((row) => row.eventType) });
  }

  console.log(JSON.stringify({
    staleAttempts: stale.length,
    cleanedOrderCodes: cleaned,
    backfilled,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
