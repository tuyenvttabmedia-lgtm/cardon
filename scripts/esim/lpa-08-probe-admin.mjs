/**
 * Probe localhost admin eSIM list. No secrets printed.
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

function loadEnv(file) {
  const text = fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx < 1 || line.startsWith('#')) continue;
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = { ...loadEnv('.env'), ...loadEnv('.env.local-full') };
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@127.0.0.1:5433/${env.POSTGRES_DB}?schema=public`,
    },
  },
});

const bases = [
  'http://admin.localhost/api/v1',
  'http://localhost/api/v1',
];

try {
  const admin = await prisma.user.findFirst({
    where: { email: { contains: 'superadmin', mode: 'insensitive' } },
    select: { email: true, status: true, role: true },
  });
  const envEmail = env.SEED_SUPER_ADMIN_EMAIL || '';
  const envPasswordLen = (env.SEED_SUPER_ADMIN_PASSWORD || '').length;
  const results = [];
  for (const base of bases) {
    const loginRes = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: env.SEED_SUPER_ADMIN_EMAIL,
        password: env.SEED_SUPER_ADMIN_PASSWORD,
      }),
    });
    const loginJson = await loginRes.json().catch(() => ({}));
    const token = loginJson?.data?.accessToken;
    let list = { status: null };
    if (token) {
      const listRes = await fetch(`${base}/admin/esim-ops/orders?skip=0&take=5`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      });
      const listJson = await listRes.json().catch(() => ({}));
      list = {
        status: listRes.status,
        success: listJson?.success ?? null,
        errorMessage: listJson?.error?.message ?? null,
        summary: listJson?.data?.summary ?? null,
        itemCount: Array.isArray(listJson?.data?.items) ? listJson.data.items.length : null,
        firstCodes: Array.isArray(listJson?.data?.items)
          ? listJson.data.items.slice(0, 3).map((row) => row.orderCode)
          : null,
      };
    }
    results.push({
      base,
      loginStatus: loginRes.status,
      loginOk: Boolean(token),
      loginError: loginJson?.error?.message ?? null,
      list,
    });
  }
  console.log(JSON.stringify({
    adminPresent: Boolean(admin),
    adminStatus: admin?.status ?? null,
    adminRole: admin?.role ?? null,
    seedEmailMatches: Boolean(admin?.email && envEmail && admin.email.toLowerCase() === envEmail.toLowerCase()),
    seedPasswordLength: envPasswordLen,
    results,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
