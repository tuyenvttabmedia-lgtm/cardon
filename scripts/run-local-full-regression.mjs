#!/usr/bin/env node
/**
 * Phase 6G — Local full stack regression (API-level).
 * Requires: docker stack up + seed-local-full.ts executed.
 * Does NOT change business logic — read-only verification + test transactions.
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const credPath = join(scriptDir, '.local-full-credentials.json');
const BASE = process.env.REGRESSION_BASE_URL ?? 'http://nginx';

const results = [];

function loadCreds() {
  return JSON.parse(readFileSync(credPath, 'utf8'));
}

function unwrap(body) {
  if (body && typeof body === 'object' && 'data' in body && body.data != null) return body.data;
  return body;
}

function record(area, pass, detail) {
  results.push({ area, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${area}: ${detail}`);
}

async function req(path, options = {}) {
  const url = `${BASE.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function login(identifier, password) {
  await sleep(500);
  const r = await req('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
  const token = r.body?.accessToken ?? unwrap(r.body)?.accessToken;
  if (!token) throw new Error(`Login failed ${identifier}: ${JSON.stringify(r.body)}`);
  return token;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poll(fn, pred, label, max = 45) {
  for (let i = 0; i < max; i++) {
    const v = await fn();
    if (pred(v)) return v;
    await sleep(2000);
  }
  throw new Error(`${label} timeout`);
}

async function main() {
  const creds = loadCreds();
  const { accounts, catalog, payment } = creds;

  // TASK 2 — DB / catalog
  const health = await req('/health/ready');
  record('T2 health/ready', health.ok && health.body?.ready === true, JSON.stringify(health.body));

  const products = await req('/api/v1/products');
  const list = unwrap(products.body);
  const items = Array.isArray(list) ? list : list?.items ?? [];
  record('T2 products', items.length >= 3, `${items.length} products`);

  const garenaVariant = items
    .flatMap((p) => p.variants ?? [])
    .find((v) => v.sku === 'GARENA-100K');
  record('T2 catalog GARENA-100K', !!garenaVariant?.id, garenaVariant?.id ?? 'missing');

  const cmsTheme = await req('/api/v1/cms/theme');
  record('T2 CMS theme', cmsTheme.ok, cmsTheme.ok ? 'theme OK' : String(cmsTheme.status));

  const cmsBlog = await req('/api/v1/cms/blog/posts?take=1');
  record('T2 CMS blog', cmsBlog.ok, cmsBlog.ok ? 'blog OK' : String(cmsBlog.status));

  // TASK 3 — Customer auth
  const regUser = `reg6g-${Date.now()}@test.local`;
  const regUsername = `user6g${Date.now().toString().slice(-6)}`;
  const regPass = 'RegTest2026!Aa';

  const reg = await req('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: regUser,
      username: regUsername,
      password: regPass,
      confirmPassword: regPass,
      fullName: 'Regression User',
      phone: '0912345678',
      acceptTerms: true,
    }),
  });
  const regBody = reg.body?.data ?? reg.body;
  const regToken = regBody?.accessToken;
  const regRefresh = regBody?.refreshToken;
  record('T3 register + auto login', reg.ok && !!regToken, reg.ok ? regUser : JSON.stringify(reg.body));

  const logout = await req('/api/v1/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${regToken}` },
    body: JSON.stringify({ refreshToken: regRefresh }),
  });
  record('T3 logout', logout.ok || logout.status === 204, `HTTP ${logout.status}`);

  const loginUser = await login(regUsername, regPass);
  record('T3 login username', !!loginUser, regUsername);

  const loginEmail = await login(regUser, regPass);
  record('T3 login email', !!loginEmail, regUser);

  const customerToken = await login(accounts.customer.email, accounts.customer.password);
  record('T3 seed customer login', !!customerToken, accounts.customer.email);

  // CARD purchase (authenticated)
  let cardOrder = null;
  if (garenaVariant?.id) {
    const orderRes = await req('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({ items: [{ variantId: garenaVariant.id, quantity: 1 }] }),
    });
    cardOrder = unwrap(orderRes.body);
    record('T3 CARD create order', orderRes.ok && cardOrder?.orderCode, cardOrder?.orderCode ?? JSON.stringify(orderRes.body));

    if (orderRes.ok) {
      const payRes = await req('/api/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customerToken}`,
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({ orderId: cardOrder.id, gateway: 'SEPAY' }),
      });
      const payment = unwrap(payRes.body);
      record('T3 SePay payment create', payRes.ok && payment?.paymentReference, payment?.paymentReference ?? 'fail');

      if (payRes.ok) {
        const sepayKey = creds.payment?.sepayWebhookHeader?.replace(/^Authorization:\s*Apikey\s*/i, '') ?? 'local-sepay-api-key-sim';
        const webhook = await req('/api/v1/payments/webhook/sepay', {
          method: 'POST',
          headers: { Authorization: `Apikey ${sepayKey}` },
          body: JSON.stringify({
            id: Math.floor(Math.random() * 900000) + 100000,
            content: `CARDON ${payment.paymentReference}`,
            transferType: 'in',
            transferAmount: Number(cardOrder.totalAmount ?? 100000),
          }),
        });
        record('T3 SePay webhook', webhook.ok, webhook.ok ? 'accepted' : JSON.stringify(webhook.body));

        try {
          const fulfilled = await poll(
            () =>
              req(`/api/v1/account/orders`, {
                headers: { Authorization: `Bearer ${customerToken}` },
              }),
            (r) => {
              const orders = unwrap(r.body) ?? [];
              const o = orders.find((x) => x.orderCode === cardOrder.orderCode);
              return o?.fulfillmentStatus === 'COMPLETED' && o?.paymentStatus === 'PAID';
            },
            'T3 fulfillment',
          );
          const orders = unwrap(fulfilled.body) ?? [];
          const o = orders.find((x) => x.orderCode === cardOrder.orderCode);
          record('T3 order PAID+COMPLETED', !!o, `${o?.paymentStatus}/${o?.fulfillmentStatus}`);
        } catch (e) {
          record('T3 fulfillment poll', false, e.message);
        }

        const cards = await req('/api/v1/account/cards', {
          headers: { Authorization: `Bearer ${customerToken}` },
        });
        const cardList = unwrap(cards.body) ?? [];
        const hasCard = Array.isArray(cardList) && cardList.some((c) => c.orderCode === cardOrder.orderCode);
        record('T3 account cards PIN', hasCard, hasCard ? 'card visible' : `${cardList.length} cards total`);
      }
    }
  }

  // TOPUP variant
  const topupVariant = items.flatMap((p) => p.variants ?? []).find((v) => v.type === 'TOPUP');
  if (topupVariant?.id) {
    const topupOrder = await req('/api/v1/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        items: [{ variantId: topupVariant.id, quantity: 1 }],
        guestPhone: '0912345678',
      }),
    });
    record('T3 TOPUP create order', topupOrder.ok, topupOrder.ok ? unwrap(topupOrder.body)?.orderCode : JSON.stringify(topupOrder.body));
  } else {
    record('T3 TOPUP create order', true, 'SKIP — no TOPUP variant in seed catalog');
  }

  // TASK 4 — Admin
  const adminToken = await login(accounts.superAdmin.email, accounts.superAdmin.password);
  const adminOrders = await req('/api/v1/admin/orders?take=5', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record('T4 admin orders list', adminOrders.ok, adminOrders.ok ? 'OK' : JSON.stringify(adminOrders.body));

  if (cardOrder?.id) {
    const detail = await req(`/api/v1/admin/orders/${cardOrder.id}/detail`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const d = unwrap(detail.body);
    const hasTabs =
      d?.overview && d?.paymentTrace != null && d?.providerTrace != null && d?.clientTrace != null;
    record('T4 order detail 5 tabs + fraud trace', detail.ok && hasTabs, hasTabs ? 'all sections present' : JSON.stringify(Object.keys(d ?? {})));
  }

  const cmsAdmin = await req('/api/v1/admin/cms/pages?take=1', {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  record('T4 CMS blog admin', cmsAdmin.ok, cmsAdmin.ok ? 'OK' : String(cmsAdmin.status));

  // TASK 5 — Partner
  const agentToken = await login(accounts.agent.email, accounts.agent.password);
  const agentMe = await req('/api/v1/agents/me', { headers: { Authorization: `Bearer ${agentToken}` } });
  record('T5 partner login', agentMe.ok, agentMe.ok ? 'dashboard OK' : JSON.stringify(agentMe.body));

  const agentCreds = await req('/api/v1/agents/me/credentials', {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  record('T5 API credentials', agentCreds.ok, JSON.stringify(unwrap(agentCreds.body)));

  const { apiKey, secretKey } = accounts.agent;
  if (apiKey && secretKey && garenaVariant?.id) {
    const requestId = `reg6g-${randomUUID()}`;
    const path = '/api/partner/v1/orders';
    const rawBody = JSON.stringify({
      requestId,
      items: [{ sku: 'GARENA-100K', quantity: 1 }],
    });
    const bodyHash = createHash('sha256').update(rawBody).digest('hex');
    const payload = `POST:${path}:${requestId}:${bodyHash}`;
    const sig = createHmac('sha256', secretKey).update(payload).digest('hex');
    const buy = await req(path, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'X-Request-Id': requestId,
        'X-Signature': sig,
      },
      body: rawBody,
    });
    record('T5 partner API buy card', buy.ok, buy.ok ? unwrap(buy.body)?.orderCode ?? 'OK' : JSON.stringify(buy.body));

    const ledger = await req('/api/v1/agents/me/ledger?limit=3', {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    record('T5 ledger', ledger.ok, ledger.ok ? `${(unwrap(ledger.body) ?? []).length} entries` : 'fail');
  }

  // TASK 6 — Role menu (API permission probes)
  const supportToken = await login(accounts.support.email, accounts.support.password);
  const supportOrders = await req('/api/v1/admin/orders?limit=1', {
    headers: { Authorization: `Bearer ${supportToken}` },
  });
  record('T6 SUPPORT orders', supportOrders.ok, `HTTP ${supportOrders.status}`);

  const supportFinance = await req('/api/v1/admin/finance/profit', {
    headers: { Authorization: `Bearer ${supportToken}` },
  });
  record('T6 SUPPORT no finance', supportFinance.status === 403, `HTTP ${supportFinance.status}`);

  const mktToken = await login(accounts.marketing.email, accounts.marketing.password);
  const mktCms = await req('/api/v1/admin/cms/pages?take=1', {
    headers: { Authorization: `Bearer ${mktToken}` },
  });
  record('T6 MARKETING cms', mktCms.ok, `HTTP ${mktCms.status}`);

  const mktOrders = await req('/api/v1/admin/orders?limit=1', {
    headers: { Authorization: `Bearer ${mktToken}` },
  });
  record('T6 MARKETING no orders', mktOrders.status === 403, `HTTP ${mktOrders.status}`);

  const accToken = await login(accounts.accountant.email, accounts.accountant.password);
  const accFinance = await req('/api/v1/admin/finance/profit', {
    headers: { Authorization: `Bearer ${accToken}` },
  });
  record('T6 ACCOUNTANT finance', accFinance.ok, `HTTP ${accFinance.status}`);

  const accCustomers = await req('/api/v1/admin/customers?limit=1', {
    headers: { Authorization: `Bearer ${accToken}` },
  });
  record('T6 ACCOUNTANT no customers', accCustomers.status === 403, `HTTP ${accCustomers.status}`);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n=== SUMMARY: ${passed} PASS / ${failed} FAIL / ${results.length} total ===`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
