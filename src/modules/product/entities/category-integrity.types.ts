import { HomeServiceType } from '@prisma/client';

export interface CategoryIntegrityRow {
  id: string;
  slug: string;
  name: string;
  homeService: HomeServiceType;
  parentId: string | null;
  sortOrder: number;
  status: string;
  createdAt: Date;
  productCount: number;
}

export interface CategoryMergeAction {
  canonicalId: string;
  canonicalSlug: string;
  canonicalName: string;
  duplicateId: string;
  duplicateSlug: string;
  duplicateName: string;
  homeService: HomeServiceType;
  reason: string;
  productIds: string[];
}

export interface CategoryAuditIssue {
  type:
    | 'duplicate_slug'
    | 'duplicate_name'
    | 'duplicate_home_service_root'
    | 'orphan_category'
    | 'empty_category'
    | 'invalid_product_category'
    | 'parent_loop'
    | 'duplicate_root_category';
  severity: 'warning' | 'error';
  categoryId?: string;
  categorySlug?: string;
  categoryName?: string;
  message: string;
  relatedIds?: string[];
}

export interface CategoryAuditReport {
  generatedAt: string;
  summary: {
    totalCategories: number;
    totalProducts: number;
    issueCount: number;
    mergeActions: number;
  };
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    homeService: HomeServiceType;
    parentId: string | null;
    productCount: number;
  }>;
  issues: CategoryAuditIssue[];
  mergePlan: CategoryMergeAction[];
}

export interface CategoryRepairResult {
  merged: number;
  deleted: number;
  updatedProducts: number;
  skipped: number;
  actions: CategoryMergeAction[];
  rollbackLogPath?: string;
}

export interface CategoryRollbackEntry {
  action: 'move_products' | 'reparent_children' | 'recreate_category';
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
