import { ContentPlan } from '@prisma/client';
import { parsePlanReferences, type PlanReferences } from '../entities/plan-references.types';
import { isOutlineV1, type OutlineV1 } from '../entities/outline.types';
import { isArticleDocumentV1, type ArticleDocumentV1 } from '../entities/article-document.types';
import {
  isIntelligenceSnapshotV1,
  type IntelligenceSnapshotV1,
} from '../entities/intelligence-snapshot.types';
import { isQualityReportV1, type QualityReportV1 } from '../entities/quality-report.types';

export interface ContentPlanListItemView {
  id: string;
  status: string;
  action: string;
  topic: string;
  primaryKeyword: string;
  searchIntent: string;
  contentType: string;
  priority: string;
  suggestedTitle: string | null;
  generationEpoch: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentPlanDetailView extends ContentPlanListItemView {
  audience: string | null;
  businessObjective: string | null;
  sourceType: string;
  sourceRefId: string | null;
  cmsPageId: string | null;
  targetPageId: string | null;
  references: PlanReferences;
  intelligenceSnapshot: IntelligenceSnapshotV1 | null;
  outline: OutlineV1 | null;
  articleDocument: ArticleDocumentV1 | null;
  qualityReport: QualityReportV1 | null;
  outlineApprovedAt: string | null;
  contentApprovedAt: string | null;
  publishedAt: string | null;
  createdById: string;
}

function mapIntelligenceSnapshot(raw: unknown): IntelligenceSnapshotV1 | null {
  return isIntelligenceSnapshotV1(raw) ? raw : null;
}

export function mapContentPlanListItem(plan: ContentPlan): ContentPlanListItemView {
  return {
    id: plan.id,
    status: plan.status,
    action: plan.action,
    topic: plan.topic,
    primaryKeyword: plan.primaryKeyword,
    searchIntent: plan.searchIntent,
    contentType: plan.contentType,
    priority: plan.priority,
    suggestedTitle: plan.suggestedTitle,
    generationEpoch: plan.generationEpoch,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function mapContentPlanDetail(plan: ContentPlan): ContentPlanDetailView {
  return {
    ...mapContentPlanListItem(plan),
    audience: plan.audience,
    businessObjective: plan.businessObjective,
    sourceType: plan.sourceType,
    sourceRefId: plan.sourceRefId,
    cmsPageId: plan.cmsPageId,
    targetPageId: plan.targetPageId,
    references: parsePlanReferences(plan.references),
    intelligenceSnapshot: mapIntelligenceSnapshot(plan.intelligenceSnapshot),
    outline: isOutlineV1(plan.outline) ? plan.outline : null,
    articleDocument: isArticleDocumentV1(plan.articleDocument) ? plan.articleDocument : null,
    qualityReport: isQualityReportV1(plan.qualityReport) ? plan.qualityReport : null,
    outlineApprovedAt: plan.outlineApprovedAt?.toISOString() ?? null,
    contentApprovedAt: plan.contentApprovedAt?.toISOString() ?? null,
    publishedAt: plan.publishedAt?.toISOString() ?? null,
    createdById: plan.createdById,
  };
}

export function buildReferencesPayload(input: {
  supportingKeywords?: string[];
  angle?: string | null;
  factVariantIds?: string[];
  adminNotes?: string | null;
  existing?: PlanReferences;
}): PlanReferences {
  return {
    supportingKeywords:
      input.supportingKeywords ?? input.existing?.supportingKeywords,
    angle: input.angle !== undefined ? (input.angle ?? undefined) : input.existing?.angle,
    factVariantIds: input.factVariantIds ?? input.existing?.factVariantIds,
    adminNotes:
      input.adminNotes !== undefined
        ? (input.adminNotes ?? undefined)
        : input.existing?.adminNotes,
  };
}
