/**
 * Phase 6O31.1 — Repair duplicate/orphan product categories.
 *
 * Usage:
 *   node --experimental-strip-types scripts/repair-category-integrity.ts --dry-run
 *   node --experimental-strip-types scripts/repair-category-integrity.ts --apply
 *   node --experimental-strip-types scripts/repair-category-integrity.ts --rollback [log-path]
 */
import { HomeServiceType, PrismaClient } from '@prisma/client';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const prisma = new PrismaClient();
const scriptDir = dirname(fileURLToPath(import.meta.url));
const reportPath = join(scriptDir, '../docs/reports/product-category-audit.json');
const defaultRollbackPath = join(scriptDir, '../logs/category-integrity-rollback.json');

const CANONICAL_ROOTS: Record<HomeServiceType, string> = {
  GAME_CARD: 'game-card',
  PHONE_CARD: 'phone-card',
  TOPUP: 'topup',
  DATA: 'data',
};

const LEGACY_DUPLICATE_SLUGS = new Set([
  'local-demo-cards',
  'local-demo-cards-game',
  'local-demo-game-cards',
  'local-demo-phone-cards',
  'local-demo-topup',
  'the-ien-thoai',
  'nap-data',
  'smoke-game-cards',
  'game-cards-local',
]);

interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  homeService: HomeServiceType;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
  createdAt: Date;
}

interface MergeAction {
  canonicalId: string;
  canonicalSlug: string;
  duplicateId: string;
  duplicateSlug: string;
  homeService: HomeServiceType;
  reason: string;
  productIds: string[];
}

interface RollbackEntry {
  duplicateId: string;
  duplicateSlug: string;
  duplicateName: string;
  homeService: HomeServiceType;
  parentId: string | null;
  sortOrder: number;
  canonicalId: string;
  productIds: string[];
  childIds: string[];
}

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s*\([^)]*\)\s*/g, ' ').trim().toLowerCase();
}

function buildMergePlan(rows: CategoryRow[]): MergeAction[] {
  const plan: MergeAction[] = [];
  const byService = new Map<HomeServiceType, CategoryRow[]>();
  for (const row of rows) {
    const list = byService.get(row.homeService) ?? [];
    list.push(row);
    byService.set(row.homeService, list);
  }

  for (const [homeService, group] of byService) {
    const canonicalSlug = CANONICAL_ROOTS[homeService];
    const canonical = group.find((c) => c.slug === canonicalSlug) ?? group.sort((a, b) => b.productCount - a.productCount)[0];
    if (!canonical) continue;

    for (const duplicate of group) {
      if (duplicate.id === canonical.id) continue;
      const isLegacy = LEGACY_DUPLICATE_SLUGS.has(duplicate.slug);
      const isDuplicateRoot = duplicate.parentId === null && duplicate.slug !== canonicalSlug;
      const isDuplicateName = normalizeName(duplicate.name) === normalizeName(canonical.name);
      if (!isLegacy && !isDuplicateRoot && !isDuplicateName) continue;
      plan.push({
        canonicalId: canonical.id,
        canonicalSlug: canonical.slug,
        duplicateId: duplicate.id,
        duplicateSlug: duplicate.slug,
        homeService,
        reason: isLegacy ? 'legacy demo category' : isDuplicateRoot ? 'duplicate root' : 'duplicate name',
        productIds: [],
      });
    }
  }
  return plan;
}

async function loadRows(): Promise<CategoryRow[]> {
  const categories = await prisma.productCategory.findMany({
    include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return categories.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    homeService: c.homeService,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    productCount: c._count.products,
    createdAt: c.createdAt,
  }));
}

async function writeAuditReport(rows: CategoryRow[]) {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: { id: true, categoryId: true },
  });
  const categoryIds = new Set(rows.map((r) => r.id));
  const mergePlan = buildMergePlan(rows).map((action) => ({
    ...action,
    productIds: products.filter((p) => p.categoryId === action.duplicateId).map((p) => p.id),
  }));

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCategories: rows.length,
      totalProducts: products.length,
      issueCount: mergePlan.length,
      mergeActions: mergePlan.length,
    },
    categories: rows,
    mergePlan,
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Audit report written: ${reportPath}`);
  return report;
}

async function applyPlan(plan: MergeAction[], rollbackPath: string) {
  const rollbackEntries: RollbackEntry[] = [];
  let merged = 0;
  let deleted = 0;
  let updatedProducts = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const action of plan) {
      const duplicate = await tx.productCategory.findUnique({ where: { id: action.duplicateId } });
      if (!duplicate) {
        skipped += 1;
        continue;
      }

      const products = await tx.product.findMany({
        where: { categoryId: action.duplicateId, deletedAt: null },
        select: { id: true },
      });
      const children = await tx.productCategory.findMany({
        where: { parentId: action.duplicateId },
        select: { id: true },
      });

      if (products.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: products.map((p) => p.id) } },
          data: { categoryId: action.canonicalId, homeService: action.homeService },
        });
        updatedProducts += products.length;
      }

      if (children.length > 0) {
        await tx.productCategory.updateMany({
          where: { id: { in: children.map((c) => c.id) } },
          data: { parentId: action.canonicalId },
        });
      }

      rollbackEntries.push({
        duplicateId: duplicate.id,
        duplicateSlug: duplicate.slug,
        duplicateName: duplicate.name,
        homeService: duplicate.homeService,
        parentId: duplicate.parentId,
        sortOrder: duplicate.sortOrder,
        canonicalId: action.canonicalId,
        productIds: products.map((p) => p.id),
        childIds: children.map((c) => c.id),
      });

      const remainingProducts = await tx.product.count({
        where: { categoryId: action.duplicateId, deletedAt: null },
      });
      const remainingChildren = await tx.productCategory.count({
        where: { parentId: action.duplicateId },
      });

      if (remainingProducts === 0 && remainingChildren === 0) {
        await tx.productCategory.delete({ where: { id: action.duplicateId } });
        deleted += 1;
      }

      merged += 1;
      console.log(`Merged: ${duplicate.slug} → ${action.canonicalSlug}`);
    }
  });

  mkdirSync(dirname(rollbackPath), { recursive: true });
  writeFileSync(
    rollbackPath,
    JSON.stringify({ createdAt: new Date().toISOString(), entries: rollbackEntries }, null, 2),
    'utf8',
  );

  console.log(`Deleted: ${deleted}`);
  console.log(`Updated Products: ${updatedProducts}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Rollback log: ${rollbackPath}`);
}

async function rollback(rollbackPath: string) {
  if (!existsSync(rollbackPath)) throw new Error(`Rollback log not found: ${rollbackPath}`);
  const payload = JSON.parse(readFileSync(rollbackPath, 'utf8')) as { entries: RollbackEntry[] };

  await prisma.$transaction(async (tx) => {
    for (const entry of [...payload.entries].reverse()) {
      let duplicate = await tx.productCategory.findUnique({ where: { id: entry.duplicateId } });
      if (!duplicate) {
        duplicate = await tx.productCategory.create({
          data: {
            id: entry.duplicateId,
            slug: entry.duplicateSlug,
            name: entry.duplicateName,
            homeService: entry.homeService,
            parentId: entry.parentId,
            sortOrder: entry.sortOrder,
            status: 'ACTIVE',
          },
        });
      }

      if (entry.productIds.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: entry.productIds } },
          data: { categoryId: duplicate.id, homeService: entry.homeService },
        });
      }

      if (entry.childIds.length > 0) {
        await tx.productCategory.updateMany({
          where: { id: { in: entry.childIds } },
          data: { parentId: duplicate.id },
        });
      }

      console.log(`Rollback: restored ${entry.duplicateSlug}`);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const apply = args.includes('--apply');
  const rollbackFlag = args.includes('--rollback');
  const rollbackPath = rollbackFlag
    ? args[args.indexOf('--rollback') + 1] ?? defaultRollbackPath
    : defaultRollbackPath;

  const rows = await loadRows();
  const report = await writeAuditReport(rows);

  if (rollbackFlag) {
    await rollback(rollbackPath);
    return;
  }

  console.log(`Merge plan: ${report.mergePlan.length} action(s)`);
  if (dryRun) {
    for (const action of report.mergePlan) {
      console.log(`[dry-run] ${action.duplicateSlug} → ${action.canonicalSlug} (${action.reason})`);
    }
    console.log(`Updated Products: ${report.mergePlan.reduce((s, a) => s + a.productIds.length, 0)}`);
    console.log(`Skipped: 0`);
    return;
  }

  if (apply) {
    await applyPlan(report.mergePlan, defaultRollbackPath);
    await writeAuditReport(await loadRows());
    return;
  }

  console.log('Use --dry-run, --apply, or --rollback');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
