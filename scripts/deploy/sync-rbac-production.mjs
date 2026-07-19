/**
 * Sync RBAC permissions + role matrix on production (safe upsert only).
 * Does NOT seed users, settings, or demo data.
 *
 * docker exec cardon-prod-api node /app/scripts/deploy/sync-rbac-production.mjs
 */
import { PrismaClient, UserRole } from '@prisma/client';

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

const ROLE_PERMISSION_MATRIX = {
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

async function main() {
  const permissionRecords = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { code: p.code },
        update: { description: p.description },
        create: p,
      }),
    ),
  );

  const permissionByCode = Object.fromEntries(permissionRecords.map((p) => [p.code, p.id]));

  let links = 0;
  for (const [role, codes] of Object.entries(ROLE_PERMISSION_MATRIX)) {
    for (const code of codes) {
      const permissionId = permissionByCode[code];
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role, permissionId } },
        update: {},
        create: { role: role, permissionId },
      });
      links += 1;
    }
  }

  console.log(`[sync-rbac] permissions=${permissionRecords.length} role_links=${links}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
