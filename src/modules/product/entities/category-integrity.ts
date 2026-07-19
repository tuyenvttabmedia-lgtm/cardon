import { HomeServiceType } from '@prisma/client';
import { HOME_SERVICE_ROOT_SLUGS } from './home-service';
import type {
  CategoryAuditIssue,
  CategoryAuditReport,
  CategoryIntegrityRow,
  CategoryMergeAction,
} from './category-integrity.types';

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

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isCanonicalRoot(category: CategoryIntegrityRow): boolean {
  return category.parentId === null && category.slug === HOME_SERVICE_ROOT_SLUGS[category.homeService];
}

function pickCanonical(
  categories: CategoryIntegrityRow[],
  homeService: HomeServiceType,
): CategoryIntegrityRow | null {
  const canonicalSlug = HOME_SERVICE_ROOT_SLUGS[homeService];
  const inService = categories.filter((c) => c.homeService === homeService);
  const official = inService.find((c) => c.slug === canonicalSlug);
  if (official) return official;

  const roots = inService.filter((c) => c.parentId === null);
  if (roots.length === 0) return inService.sort((a, b) => b.productCount - a.productCount)[0] ?? null;

  return roots.sort((a, b) => {
    if (b.productCount !== a.productCount) return b.productCount - a.productCount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0];
}

export function detectParentLoops(categories: CategoryIntegrityRow[]): CategoryAuditIssue[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const issues: CategoryAuditIssue[] = [];

  for (const category of categories) {
    if (!category.parentId) continue;
    const visited = new Set<string>([category.id]);
    let current = byId.get(category.parentId);
    while (current) {
      if (visited.has(current.id)) {
        issues.push({
          type: 'parent_loop',
          severity: 'error',
          categoryId: category.id,
          categorySlug: category.slug,
          categoryName: category.name,
          message: `Parent loop detected starting at "${category.name}"`,
          relatedIds: [...visited, current.id],
        });
        break;
      }
      visited.add(current.id);
      if (!current.parentId) break;
      current = byId.get(current.parentId);
    }
  }

  return issues;
}

export function buildCategoryMergePlan(categories: CategoryIntegrityRow[]): CategoryMergeAction[] {
  const plan: CategoryMergeAction[] = [];
  const byService = new Map<HomeServiceType, CategoryIntegrityRow[]>();

  for (const category of categories) {
    const list = byService.get(category.homeService) ?? [];
    list.push(category);
    byService.set(category.homeService, list);
  }

  for (const [homeService, group] of byService) {
    const canonical = pickCanonical(group, homeService);
    if (!canonical) continue;

    for (const duplicate of group) {
      if (duplicate.id === canonical.id) continue;

      const isLegacy = LEGACY_DUPLICATE_SLUGS.has(duplicate.slug);
      const isDuplicateRoot = duplicate.parentId === null && !isCanonicalRoot(duplicate);
      const isDuplicateName =
        normalizeName(duplicate.name) === normalizeName(canonical.name) ||
        normalizeName(duplicate.name) === normalizeName(canonical.name.replace(/\s*\([^)]*\)/, '').trim());

      if (!isLegacy && !isDuplicateRoot && !isDuplicateName) {
        const sameParent = duplicate.parentId === canonical.parentId;
        const sameNormalizedName =
          normalizeName(duplicate.name) === normalizeName(canonical.name);
        if (!(sameParent && sameNormalizedName)) continue;
      }

      let reason = 'duplicate category';
      if (isLegacy) reason = 'legacy demo category';
      else if (isDuplicateRoot) reason = 'duplicate homeService root';
      else if (isDuplicateName) reason = 'duplicate display name';

      plan.push({
        canonicalId: canonical.id,
        canonicalSlug: canonical.slug,
        canonicalName: canonical.name,
        duplicateId: duplicate.id,
        duplicateSlug: duplicate.slug,
        duplicateName: duplicate.name,
        homeService,
        reason,
        productIds: [],
      });
    }
  }

  return plan;
}

export function auditCategories(
  categories: CategoryIntegrityRow[],
  invalidProductCategoryIds: string[] = [],
): CategoryAuditReport {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const issues: CategoryAuditIssue[] = [];

  const slugSeen = new Map<string, string>();
  for (const category of categories) {
    const key = category.slug.toLowerCase();
    const prev = slugSeen.get(key);
    if (prev) {
      issues.push({
        type: 'duplicate_slug',
        severity: 'error',
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        message: `Duplicate slug: ${category.slug}`,
        relatedIds: [prev],
      });
    } else {
      slugSeen.set(key, category.id);
    }
  }

  const nameGroups = new Map<string, CategoryIntegrityRow[]>();
  for (const category of categories) {
    const key = `${category.parentId ?? 'root'}::${normalizeName(category.name)}`;
    const list = nameGroups.get(key) ?? [];
    list.push(category);
    nameGroups.set(key, list);
  }
  for (const [, group] of nameGroups) {
    if (group.length <= 1) continue;
    for (const category of group) {
      issues.push({
        type: 'duplicate_name',
        severity: 'warning',
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        message: `Duplicate name "${category.name}" under same parent`,
        relatedIds: group.filter((c) => c.id !== category.id).map((c) => c.id),
      });
    }
  }

  const rootByService = new Map<HomeServiceType, CategoryIntegrityRow[]>();
  for (const category of categories.filter((c) => c.parentId === null)) {
    const list = rootByService.get(category.homeService) ?? [];
    list.push(category);
    rootByService.set(category.homeService, list);
  }
  for (const [service, roots] of rootByService) {
    if (roots.length <= 1) continue;
    for (const root of roots) {
      if (isCanonicalRoot(root)) continue;
      issues.push({
        type: 'duplicate_home_service_root',
        severity: 'error',
        categoryId: root.id,
        categorySlug: root.slug,
        categoryName: root.name,
        message: `Duplicate root for ${service}`,
        relatedIds: roots.filter((r) => r.id !== root.id).map((r) => r.id),
      });
    }
  }

  for (const category of categories) {
    if (category.parentId && !byId.has(category.parentId)) {
      issues.push({
        type: 'orphan_category',
        severity: 'error',
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        message: `Orphan category — parent missing`,
        relatedIds: [category.parentId],
      });
    }
  }

  for (const category of categories) {
    if (category.productCount === 0 && !isCanonicalRoot(category)) {
      issues.push({
        type: 'empty_category',
        severity: 'warning',
        categoryId: category.id,
        categorySlug: category.slug,
        categoryName: category.name,
        message: 'Category không có product',
      });
    }
  }

  for (const categoryId of invalidProductCategoryIds) {
    issues.push({
      type: 'invalid_product_category',
      severity: 'error',
      categoryId,
      message: 'Product references invalid categoryId',
    });
  }

  issues.push(...detectParentLoops(categories));

  const mergePlan = buildCategoryMergePlan(categories);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCategories: categories.length,
      totalProducts: categories.reduce((sum, c) => sum + c.productCount, 0),
      issueCount: issues.length,
      mergeActions: mergePlan.length,
    },
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      homeService: c.homeService,
      parentId: c.parentId,
      productCount: c.productCount,
    })),
    issues,
    mergePlan,
  };
}
