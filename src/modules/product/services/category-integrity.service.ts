import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { auditCategories, buildCategoryMergePlan } from '../entities/category-integrity';
import type {
  CategoryAuditReport,
  CategoryIntegrityRow,
  CategoryMergeAction,
  CategoryRepairResult,
  CategoryRollbackEntry,
} from '../entities/category-integrity.types';
import type { AutoFixResult, IntegrityFinding } from '../entities/integrity.types';

let findingCounter = 0;

function nextId(prefix: string) {
  findingCounter += 1;
  return `${prefix}-${findingCounter}`;
}

@Injectable()
export class CategoryIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async loadCategoryRows(): Promise<CategoryIntegrityRow[]> {
    const categories = await this.prisma.productCategory.findMany({
      include: {
        _count: {
          select: {
            products: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      homeService: c.homeService,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      status: c.status,
      createdAt: c.createdAt,
      productCount: c._count.products,
    }));
  }

  async audit(invalidProductCategoryIds: string[] = []): Promise<CategoryAuditReport> {
    const rows = await this.loadCategoryRows();
    const products = await this.prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, categoryId: true },
    });

    const categoryIds = new Set(rows.map((r) => r.id));
    const invalidIds = [
      ...invalidProductCategoryIds,
      ...products.filter((p) => !categoryIds.has(p.categoryId)).map((p) => p.categoryId),
    ];

    const report = auditCategories(rows, [...new Set(invalidIds)]);

    const productsByCategory = new Map<string, string[]>();
    for (const product of products) {
      const list = productsByCategory.get(product.categoryId) ?? [];
      list.push(product.id);
      productsByCategory.set(product.categoryId, list);
    }

    report.mergePlan = report.mergePlan.map((action) => ({
      ...action,
      productIds: productsByCategory.get(action.duplicateId) ?? [],
    }));

    return report;
  }

  async scan(): Promise<IntegrityFinding[]> {
    findingCounter = 0;
    const report = await this.audit();
    const findings: IntegrityFinding[] = [];

    for (const issue of report.issues) {
      const autoFixable =
        issue.type === 'duplicate_home_service_root' ||
        issue.type === 'duplicate_name' ||
        issue.type === 'empty_category' ||
        issue.type === 'orphan_category';

      findings.push({
        id: nextId('cat-int'),
        domain: 'category_integrity',
        severity: issue.severity,
        entityType: 'Category',
        entityId: issue.categoryId,
        entityLabel: issue.categoryName ?? issue.categorySlug ?? 'Category',
        message: issue.message,
        autoFixable,
        fixAction: autoFixable ? 'merge_duplicate_categories' : undefined,
      });
    }

    if (report.mergePlan.length === 0 && report.issues.length === 0) {
      findings.push({
        id: nextId('cat-int'),
        domain: 'category_integrity',
        severity: 'ok',
        entityType: 'Category Integrity',
        entityLabel: 'Category Integrity',
        message: 'Healthy',
        autoFixable: false,
      });
    }

    return findings;
  }

  async applyMergePlan(
    plan: CategoryMergeAction[],
    options: { dryRun?: boolean; rollbackLogPath?: string } = {},
  ): Promise<CategoryRepairResult> {
    const result: CategoryRepairResult = {
      merged: 0,
      deleted: 0,
      updatedProducts: 0,
      skipped: 0,
      actions: [],
      rollbackLogPath: options.rollbackLogPath,
    };

    const rollbackEntries: CategoryRollbackEntry[] = [];

    if (options.dryRun) {
      result.actions = plan;
      result.merged = plan.length;
      result.updatedProducts = plan.reduce((sum, a) => sum + a.productIds.length, 0);
      return result;
    }

    await this.prisma.$transaction(async (tx) => {
      for (const action of plan) {
        const duplicate = await tx.productCategory.findUnique({ where: { id: action.duplicateId } });
        if (!duplicate) {
          result.skipped += 1;
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
          result.updatedProducts += products.length;
        }

        if (children.length > 0) {
          await tx.productCategory.updateMany({
            where: { id: { in: children.map((c) => c.id) } },
            data: { parentId: action.canonicalId },
          });
        }

        rollbackEntries.push({
          action: 'move_products',
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
          result.deleted += 1;
        }

        result.merged += 1;
        result.actions.push({ ...action, productIds: products.map((p) => p.id) });
      }
    });

    if (options.rollbackLogPath && rollbackEntries.length > 0) {
      const fs = await import('fs/promises');
      const path = await import('path');
      await fs.mkdir(path.dirname(options.rollbackLogPath), { recursive: true });
      await fs.writeFile(
        options.rollbackLogPath,
        JSON.stringify({ createdAt: new Date().toISOString(), entries: rollbackEntries }, null, 2),
        'utf8',
      );
    }

    return result;
  }

  async autoFix(_findings: IntegrityFinding[]): Promise<AutoFixResult> {
    const rows = await this.loadCategoryRows();
    const plan = buildCategoryMergePlan(rows);
    await this.repairOrphanParents();
    const repair = await this.applyMergePlan(plan);

    return {
      applied: repair.merged,
      skipped: repair.skipped,
      actions: repair.actions.map((action, index) => ({
        findingId: `merge-${index}`,
        action: 'merge_duplicate_categories',
        success: true,
        message: `${action.duplicateSlug} → ${action.canonicalSlug}`,
      })),
    };
  }

  async repairOrphanParents(): Promise<number> {
    const categories = await this.prisma.productCategory.findMany({
      select: { id: true, parentId: true },
    });
    const ids = new Set(categories.map((c) => c.id));
    const orphans = categories.filter((c) => c.parentId && !ids.has(c.parentId));
    if (orphans.length === 0) return 0;

    await this.prisma.$transaction(
      orphans.map((c) =>
        this.prisma.productCategory.update({
          where: { id: c.id },
          data: { parentId: null },
        }),
      ),
    );
    return orphans.length;
  }
}
