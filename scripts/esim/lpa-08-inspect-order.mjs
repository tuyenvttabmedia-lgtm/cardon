/**
 * Localhost inspect for one CardOn order. No secrets. No Airalo calls.
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

const primary = loadEnvFile('.env');
const localFull = loadEnvFile('.env.local-full');
const user = localFull.POSTGRES_USER || primary.POSTGRES_USER;
const password = localFull.POSTGRES_PASSWORD || primary.POSTGRES_PASSWORD;
const db = localFull.POSTGRES_DB || primary.POSTGRES_DB;
const prisma = new PrismaClient({
  datasources: { db: { url: `postgresql://${user}:${password}@127.0.0.1:5433/${db}?schema=public` } },
});

try {
  const order = await prisma.order.findFirst({
    where: { orderCode: { contains: 'FA1FF5', mode: 'insensitive' } },
    select: {
      id: true,
      orderCode: true,
      channel: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      paymentMethodCode: true,
      paymentGateway: true,
      customerPaid: true,
      createdAt: true,
      guestEmail: true,
      user: { select: { email: true } },
      orderItems: {
        select: {
          id: true,
          quantity: true,
          variant: {
            select: {
              name: true,
              type: true,
              sku: true,
              product: { select: { name: true, slug: true, homeService: true } },
            },
          },
          esimQuote: { select: { id: true, providerProductCode: true } },
          esimProfile: { select: { id: true, createdAt: true } },
          esimAttempts: {
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { id: true, outcome: true, providerReference: true, errorMessage: true, createdAt: true },
          },
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { id: true, status: true, gateway: true, amount: true, createdAt: true },
      },
    },
  });

  const esimCount = await prisma.order.count({
    where: {
      channel: 'B2C',
      orderItems: { some: { variant: { type: 'ESIM' } } },
    },
  });
  const recent = await prisma.order.findMany({
    where: { createdAt: { gte: new Date('2026-10-26T00:00:00.000Z') } },
    orderBy: { createdAt: 'desc' },
    take: 8,
    select: {
      orderCode: true,
      channel: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      orderItems: {
        select: {
          variant: { select: { type: true, name: true } },
        },
      },
    },
  });

  console.log(JSON.stringify({
    db: '127.0.0.1:5433',
    found: Boolean(order),
    order: order
      ? {
          id: order.id,
          orderCode: order.orderCode,
          channel: order.channel,
          paymentStatus: order.paymentStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          customerStatus: order.customerStatus,
          paymentMethodCode: order.paymentMethodCode,
          paymentGateway: order.paymentGateway,
          customerPaid: order.customerPaid?.toString(),
          createdAt: order.createdAt.toISOString(),
          emailSource: order.user?.email ? 'user' : order.guestEmail ? 'guest' : 'none',
          items: order.orderItems.map((item) => ({
            variantType: item.variant?.type,
            variantName: item.variant?.name,
            sku: item.variant?.sku,
            productName: item.variant?.product?.name,
            homeService: item.variant?.product?.homeService,
            hasQuote: Boolean(item.esimQuote),
            quoteCode: item.esimQuote?.providerProductCode ?? null,
            hasProfile: Boolean(item.esimProfile),
            attemptCount: item.esimAttempts.length,
            attempts: item.esimAttempts.map((attempt) => ({
              outcome: attempt.outcome,
              hasReference: Boolean(attempt.providerReference),
              hasError: Boolean(attempt.errorMessage),
              createdAt: attempt.createdAt.toISOString(),
            })),
          })),
          payments: order.payments.map((payment) => ({
            status: payment.status,
            gateway: payment.gateway,
            amount: payment.amount?.toString(),
            createdAt: payment.createdAt.toISOString(),
          })),
        }
      : null,
    esimOpsEligibleCount: esimCount,
    recentToday: recent.map((row) => ({
      orderCode: row.orderCode,
      channel: row.channel,
      paymentStatus: row.paymentStatus,
      fulfillmentStatus: row.fulfillmentStatus,
      variantTypes: row.orderItems.map((item) => item.variant?.type),
      names: row.orderItems.map((item) => item.variant?.name),
    })),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
