/**
 * One-time local admin bootstrap for production simulation.
 * Does NOT reset production data — upserts permissions + SUPER_ADMIN only.
 *
 * Usage (host, postgres exposed on 5433):
 *   set DATABASE_URL=postgresql://cardon:...@127.0.0.1:5433/cardon?schema=public
 *   node --experimental-strip-types scripts/create-admin-local.ts
 *
 * Or via Docker:
 *   docker exec cardon-prod-api node --experimental-strip-types /app/scripts/create-admin-local.ts
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { code: 'users.read', description: 'View user/agent list' },
  { code: 'orders.read', description: 'View orders' },
  { code: 'orders.manage', description: 'Manage orders (status, notes)' },
  { code: 'orders.retry', description: 'Retry failed fulfillment' },
  { code: 'payments.view', description: 'View payment records' },
  { code: 'ledger.view', description: 'View agent ledger' },
  { code: 'agents.kyc.review', description: 'Approve or reject agent KYC' },
  { code: 'agents.credit', description: 'Manual agent balance credit' },
  { code: 'agents.manage', description: 'Suspend or manage agents' },
  { code: 'providers.manage', description: 'Provider config and sync' },
  { code: 'pricing.manage', description: 'Product/variant pricing and agent prices' },
  { code: 'products.manage', description: 'Manage product catalog, categories, variants' },
  { code: 'invoice.manage', description: 'View and void invoices' },
  { code: 'cms.manage', description: 'CMS pages, banners, SEO' },
  { code: 'settings.manage', description: 'System settings' },
  { code: 'admin.dashboard', description: 'View admin dashboard metrics' },
  { code: 'audit.view', description: 'View admin audit logs' },
  { code: 'audit.read', description: 'View system audit logs' },
  { code: 'audit.export', description: 'Export system audit logs' },
  { code: 'activity.read', description: 'View system activity logs' },
  { code: 'activity.export', description: 'Export system activity logs' },
  { code: 'notification.read', description: 'View notification center' },
  { code: 'notification.manage', description: 'Manage notifications (export, dismiss)' },
  { code: 'queue.read', description: 'View queue monitor' },
  { code: 'queue.manage', description: 'Manage queues (retry, pause, clean)' },
  { code: 'queue.export', description: 'Export queue monitor data' },
  { code: 'webhook.read', description: 'View webhook monitor' },
  { code: 'webhook.manage', description: 'Manage webhooks (retry, cancel)' },
  { code: 'webhook.export', description: 'Export webhook monitor data' },
  { code: 'configuration.read', description: 'View configuration center' },
  { code: 'configuration.manage', description: 'Manage configuration (save, test, import/export)' },
  { code: 'maintenance.read', description: 'View maintenance center' },
  { code: 'maintenance.manage', description: 'Manage platform maintenance' },
  { code: 'payments.review', description: 'Resolve manual payment reviews' },
  { code: 'finance.view', description: 'View finance reports, profit, statements, invoices' },
  { code: 'finance.manage', description: 'Create reconcile reports, invoices, and exports' },
  { code: 'customers.read', description: 'View customer accounts' },
  { code: 'customers.manage', description: 'Manage customer accounts' },
  { code: 'users.manage', description: 'Manage staff accounts' },
  { code: 'cards.reveal', description: 'Reveal card PIN in order detail (legacy)' },
  { code: 'card.pin.view', description: 'Secure admin PIN reveal with audit reason' },
  { code: 'support.manage', description: 'Manage customer support tickets' },
  { code: 'reconciliation.read', description: 'View operations reconciliation and exceptions' },
  { code: 'reconciliation.manage', description: 'Assign and resolve operations exceptions' },
  { code: 'operations.manage', description: 'Execute manual operations center actions' },
  { code: 'invoice.read', description: 'View invoice center (operations)' },
];

const ROLE_PERMISSION_MATRIX: Record<UserRole, string[]> = {
  CUSTOMER: [],
  AGENT: [],
  SUPPORT: [
    'users.read',
    'customers.read',
    'customers.manage',
    'orders.read',
    'orders.retry',
    'payments.view',
    'agents.kyc.review',
    'support.manage',
    'notification.read',
    'queue.read',
    'webhook.read',
    'reconciliation.read',
  ],
  MARKETING: ['cms.manage', 'notification.read'],
  ACCOUNTANT: [
    'users.read',
    'orders.read',
    'payments.view',
    'ledger.view',
    'invoice.manage',
    'invoice.read',
    'agents.credit',
    'payments.review',
    'finance.view',
    'finance.manage',
    'reconciliation.read',
    'reconciliation.manage',
    'invoice.read',
    'notification.read',
  ],
  ADMIN: [
    'users.read',
    'customers.read',
    'customers.manage',
    'orders.read',
    'orders.manage',
    'orders.retry',
    'payments.view',
    'ledger.view',
    'providers.manage',
    'pricing.manage',
    'products.manage',
    'invoice.manage',
    'cms.manage',
    'agents.kyc.review',
    'agents.credit',
    'agents.manage',
    'admin.dashboard',
    'audit.view',
    'audit.read',
    'activity.read',
    'notification.read',
    'queue.read',
    'queue.manage',
    'queue.export',
    'webhook.read',
    'webhook.manage',
    'webhook.export',
    'configuration.read',
    'configuration.manage',
    'maintenance.read',
    'payments.review',
    'finance.view',
    'finance.manage',
    'reconciliation.read',
    'reconciliation.manage',
    'operations.manage',
    'invoice.read',
    'cards.reveal',
    'card.pin.view',
    'support.manage',
  ],
  SUPER_ADMIN: PERMISSIONS.map((p) => p.code),
};

const DEMO_CATALOG = {
  providerCode: 'ESALE',
  categorySlug: 'game-cards-local',
  productSlug: 'zing-sim',
  variantSku: 'ZING-100K-SIM',
};

export async function ensurePermissions() {
  const permissionRecords = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { code: p.code },
        update: { description: p.description },
        create: p,
      }),
    ),
  );

  const permissionByCode = Object.fromEntries(
    permissionRecords.map((p) => [p.code, p.id]),
  );

  for (const [role, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    for (const code of codes) {
      const permissionId = permissionByCode[code];
      if (!permissionId) continue;

      await prisma.rolePermission.upsert({
        where: {
          role_permissionId: { role: role as UserRole, permissionId },
        },
        update: {},
        create: { role: role as UserRole, permissionId },
      });
    }
  }
}

async function ensureDemoCatalog() {
  const provider = await prisma.provider.upsert({
    where: { code: DEMO_CATALOG.providerCode },
    update: { status: 'ACTIVE', name: 'eSale (Mock Local)' },
    create: {
      code: DEMO_CATALOG.providerCode,
      name: 'eSale (Mock Local)',
      status: 'ACTIVE',
      apiCredentials: '{}',
    },
  });

  const category = await prisma.productCategory.upsert({
    where: { slug: DEMO_CATALOG.categorySlug },
    update: { name: 'Game Cards (Local Sim)', status: 'ACTIVE' },
    create: {
      slug: DEMO_CATALOG.categorySlug,
      name: 'Game Cards (Local Sim)',
      status: 'ACTIVE',
      sortOrder: 1,
    },
  });

  const product = await prisma.product.upsert({
    where: { slug: DEMO_CATALOG.productSlug },
    update: {
      name: 'Zing Card (Local Sim)',
      status: 'ACTIVE',
      categoryId: category.id,
    },
    create: {
      slug: DEMO_CATALOG.productSlug,
      name: 'Zing Card (Local Sim)',
      status: 'ACTIVE',
      categoryId: category.id,
    },
  });

  const variant = await prisma.productVariant.upsert({
    where: { sku: DEMO_CATALOG.variantSku },
    update: {
      name: 'Zing 100K',
      status: 'ACTIVE',
      type: 'CARD',
      faceValue: 100000,
      sellPrice: 100000,
      productId: product.id,
    },
    create: {
      sku: DEMO_CATALOG.variantSku,
      name: 'Zing 100K',
      status: 'ACTIVE',
      type: 'CARD',
      faceValue: 100000,
      sellPrice: 100000,
      productId: product.id,
    },
  });

  await prisma.providerProductMapping.upsert({
    where: {
      providerId_productVariantId: {
        providerId: provider.id,
        productVariantId: variant.id,
      },
    },
    update: {
      status: 'ACTIVE',
      providerProductCode: 'ZING|100000|Card',
      providerCost: 95000,
      priority: 1,
    },
    create: {
      providerId: provider.id,
      productVariantId: variant.id,
      status: 'ACTIVE',
      providerProductCode: 'ZING|100000|Card',
      providerCost: 95000,
      priority: 1,
    },
  });

  return variant.id;
}

export async function ensureSuperAdmin() {
  const email =
    process.env.LOCAL_ADMIN_EMAIL ??
    process.env.SEED_SUPER_ADMIN_EMAIL ??
    'superadmin@cardon.vn';
  const password =
    process.env.LOCAL_ADMIN_PASSWORD ??
    process.env.SEED_SUPER_ADMIN_PASSWORD ??
    'SuperAdmin2026!';
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
      passwordHash,
    },
    create: {
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: 'ACTIVE',
    },
  });

  return email;
}

async function main() {
  console.log('[create-admin-local] Ensuring RBAC permissions...');
  await ensurePermissions();

  console.log('[create-admin-local] Ensuring demo catalog for smoke tests...');
  const variantId = await ensureDemoCatalog();

  const email = await ensureSuperAdmin();
  console.log(`[create-admin-local] SUPER_ADMIN ready: ${email}`);
  console.log(`[create-admin-local] Demo variant SKU: ${DEMO_CATALOG.variantSku} (${variantId})`);
  console.log('[create-admin-local] Done — no existing data was reset.');
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error('[create-admin-local] Failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
