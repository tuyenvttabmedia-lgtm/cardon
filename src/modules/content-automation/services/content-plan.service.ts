import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentPlanAction,
  ContentPlanStatus,
  Prisma,
} from '@prisma/client';
import {
  CreateContentPlanDto,
  ListContentPlansQueryDto,
  UpdateContentPlanDto,
} from '../dto/content-plan.dto';
import { CONTENT_AUTOMATION_SOURCE_TYPE_MANUAL } from '../entities/content-automation.constants';
import {
  assertContentPlanTransition,
  canTransitionContentPlan,
} from '../entities/content-plan-state.machine';
import {
  buildReferencesPayload,
  mapContentPlanDetail,
  mapContentPlanListItem,
  type ContentPlanDetailView,
  type ContentPlanListItemView,
} from '../mappers/content-plan.mapper';
import { parsePlanReferences } from '../entities/plan-references.types';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { AiRunRepository } from '../repositories/ai-run.repository';
import { ContentAutomationQueueProducer } from '../producers/content-automation-queue.producer';
import { ContentAutomationAuditService } from './content-automation-audit.service';
import { ContextBuilderService } from './context-builder.service';
import { isArticleDocumentV1 } from '../entities/article-document.types';
import type { GenerationContext } from '../entities/generation-context.types';
import { isQualityReportV1 } from '../entities/quality-report.types';
import { ContentAutomationCmsAdapter } from './content-automation-cms.adapter';
import { QualityGateService } from './quality-gate.service';
import { renderArticleDocumentHtml } from '../renderers/article-document.renderer';

const EDITABLE_STATUSES: ContentPlanStatus[] = [
  ContentPlanStatus.DRAFT,
  ContentPlanStatus.PLANNED,
  ContentPlanStatus.OUTLINE_READY,
  ContentPlanStatus.OUTLINE_APPROVED,
  ContentPlanStatus.CONTENT_READY,
  ContentPlanStatus.IN_REVIEW,
  ContentPlanStatus.APPROVED,
  ContentPlanStatus.ARCHIVED,
];

@Injectable()
export class ContentPlanService {
  constructor(
    private readonly planRepository: ContentPlanRepository,
    private readonly aiRunRepository: AiRunRepository,
    private readonly queueProducer: ContentAutomationQueueProducer,
    private readonly contextBuilder: ContextBuilderService,
    private readonly audit: ContentAutomationAuditService,
    private readonly qualityGate: QualityGateService,
    private readonly cmsAdapter: ContentAutomationCmsAdapter,
  ) {}

  async create(userId: string, dto: CreateContentPlanDto): Promise<ContentPlanDetailView> {
    const references = buildReferencesPayload({
      supportingKeywords: dto.supportingKeywords,
      angle: dto.angle,
      adminNotes: dto.adminNotes,
    });

    const plan = await this.planRepository.create({
      topic: dto.topic.trim(),
      primaryKeyword: dto.primaryKeyword.trim(),
      searchIntent: dto.searchIntent,
      contentType: dto.contentType,
      audience: dto.audience?.trim() ?? null,
      businessObjective: dto.businessObjective?.trim() ?? null,
      priority: dto.priority ?? 'MEDIUM',
      suggestedTitle: dto.suggestedTitle?.trim() ?? null,
      sourceType: CONTENT_AUTOMATION_SOURCE_TYPE_MANUAL,
      status: ContentPlanStatus.DRAFT,
      action: ContentPlanAction.CREATE,
      references: references as Prisma.InputJsonValue,
      createdBy: { connect: { id: userId } },
    });

    this.audit.log('plan.created', { planId: plan.id, userId, topic: plan.topic });
    return mapContentPlanDetail(plan);
  }

  async list(query: ListContentPlansQueryDto): Promise<{
    items: ContentPlanListItemView[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { items, total } = await this.planRepository.list({
      status: query.status,
      contentType: query.contentType,
      q: query.q?.trim(),
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items: items.map(mapContentPlanListItem),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getById(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    return mapContentPlanDetail(plan);
  }

  async getContext(id: string): Promise<GenerationContext> {
    return this.contextBuilder.build(id);
  }

  async update(id: string, dto: UpdateContentPlanDto): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);

    if (dto.action === ContentPlanAction.IGNORE) {
      return this.archive(id, plan);
    }

    if (!EDITABLE_STATUSES.includes(plan.status)) {
      throw new BadRequestException(
        `Cannot edit plan metadata in status ${plan.status}`,
      );
    }

    const existingRefs = parsePlanReferences(plan.references);
    const references = buildReferencesPayload({
      supportingKeywords: dto.supportingKeywords,
      angle: dto.angle,
      factVariantIds: dto.factVariantIds,
      adminNotes: dto.adminNotes,
      existing: existingRefs,
    });

    const updated = await this.planRepository.update(id, {
      ...(dto.topic !== undefined ? { topic: dto.topic.trim() } : {}),
      ...(dto.primaryKeyword !== undefined
        ? { primaryKeyword: dto.primaryKeyword.trim() }
        : {}),
      ...(dto.searchIntent !== undefined ? { searchIntent: dto.searchIntent } : {}),
      ...(dto.contentType !== undefined ? { contentType: dto.contentType } : {}),
      ...(dto.audience !== undefined ? { audience: dto.audience } : {}),
      ...(dto.businessObjective !== undefined
        ? { businessObjective: dto.businessObjective }
        : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.suggestedTitle !== undefined ? { suggestedTitle: dto.suggestedTitle } : {}),
      ...(dto.action !== undefined ? { action: dto.action } : {}),
      references: references as Prisma.InputJsonValue,
    });

    this.audit.log('plan.updated', { planId: id, fields: Object.keys(dto) });
    return mapContentPlanDetail(updated);
  }

  async restore(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.ARCHIVED) {
      throw new BadRequestException('Only ARCHIVED plans can be restored');
    }
    assertContentPlanTransition(plan.status, ContentPlanStatus.DRAFT);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.DRAFT,
      action: ContentPlanAction.CREATE,
    });
    this.audit.log('plan.restored', { planId: id });
    return mapContentPlanDetail(updated);
  }

  /**
   * Hard-delete plan (+ cascaded AI runs). Does not delete linked CMS page.
   * PUBLISHED plans are blocked — unpublish/archive in CMS first if needed.
   */
  async remove(id: string): Promise<{ deleted: true; id: string; cmsPageId: string | null }> {
    const plan = await this.requirePlan(id);
    if (plan.status === ContentPlanStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot delete a PUBLISHED plan — archive it first or unlink the CMS page',
      );
    }
    const cmsPageId = plan.cmsPageId;
    await this.planRepository.delete(id);
    this.audit.log('plan.deleted', { planId: id, cmsPageId, topic: plan.topic });
    return { deleted: true, id, cmsPageId };
  }

  async archive(
    id: string,
    existing?: Awaited<ReturnType<ContentPlanRepository['findById']>>,
  ): Promise<ContentPlanDetailView> {
    const plan = existing ?? (await this.requirePlan(id));
    if (plan.status === ContentPlanStatus.ARCHIVED) {
      return mapContentPlanDetail(plan);
    }

    if (!canTransitionContentPlan(plan.status, ContentPlanStatus.ARCHIVED)) {
      throw new BadRequestException(
        `Cannot archive plan from status ${plan.status}`,
      );
    }

    assertContentPlanTransition(plan.status, ContentPlanStatus.ARCHIVED);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.ARCHIVED,
      action: ContentPlanAction.IGNORE,
    });

    this.audit.log('plan.archived', { planId: id, fromStatus: plan.status });
    return mapContentPlanDetail(updated);
  }

  async requestAnalyze(
    id: string,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.DRAFT) {
      throw new BadRequestException('Analyze is only allowed for DRAFT plans');
    }

    this.audit.log('plan.analyze.requested', {
      planId: id,
      generationEpoch: plan.generationEpoch,
    });

    return this.queueProducer.enqueueAnalyze(id, plan.generationEpoch);
  }

  async requestGenerateOutline(
    id: string,
    bumpEpoch = false,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean; generationEpoch: number }> {
    let plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.PLANNED) {
      throw new BadRequestException('Generate outline requires PLANNED status');
    }

    if (bumpEpoch) {
      plan = await this.bumpEpoch(id, plan.generationEpoch);
    }

    this.audit.log('plan.outline.requested', { planId: id, generationEpoch: plan.generationEpoch });
    const result = await this.queueProducer.enqueueOutline(id, plan.generationEpoch);
    return { ...result, generationEpoch: plan.generationEpoch };
  }

  async approveOutline(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.OUTLINE_READY) {
      throw new BadRequestException('Approve outline requires OUTLINE_READY status');
    }
    assertContentPlanTransition(plan.status, ContentPlanStatus.OUTLINE_APPROVED);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.OUTLINE_APPROVED,
      outlineApprovedAt: new Date(),
    });
    this.audit.log('plan.outline.approved', { planId: id });
    return mapContentPlanDetail(updated);
  }

  async rejectOutline(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.OUTLINE_READY) {
      throw new BadRequestException('Reject outline requires OUTLINE_READY status');
    }
    const bumped = await this.bumpEpoch(id, plan.generationEpoch);
    assertContentPlanTransition(plan.status, ContentPlanStatus.PLANNED);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.PLANNED,
      generationEpoch: bumped.generationEpoch,
      outline: Prisma.DbNull,
    });
    this.audit.log('plan.outline.rejected', { planId: id });
    return mapContentPlanDetail(updated);
  }

  async requestGenerateArticle(
    id: string,
    bumpEpoch = false,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean; generationEpoch: number }> {
    let plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.OUTLINE_APPROVED) {
      throw new BadRequestException('Generate article requires OUTLINE_APPROVED status');
    }

    if (bumpEpoch) {
      plan = await this.bumpEpoch(id, plan.generationEpoch);
    }

    this.audit.log('plan.write.requested', { planId: id, generationEpoch: plan.generationEpoch });
    const result = await this.queueProducer.enqueueWrite(id, plan.generationEpoch);
    return { ...result, generationEpoch: plan.generationEpoch };
  }

  async runQualityGate(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (!isArticleDocumentV1(plan.articleDocument)) {
      throw new BadRequestException('Article document missing');
    }
    if (
      plan.status !== ContentPlanStatus.CONTENT_READY &&
      plan.status !== ContentPlanStatus.IN_REVIEW
    ) {
      throw new BadRequestException('Quality gate requires CONTENT_READY or IN_REVIEW status');
    }
    const context = await this.contextBuilder.build(id);
    const report = await this.qualityGate.runGateAsync(plan, plan.articleDocument, context);
    const updated = await this.planRepository.update(id, {
      qualityReport: report as object,
      ...(plan.status === ContentPlanStatus.CONTENT_READY && report.passed
        ? { status: ContentPlanStatus.IN_REVIEW }
        : {}),
    });
    this.audit.log('plan.quality.checked', { planId: id, passed: report.passed });
    return mapContentPlanDetail(updated);
  }

  async approveContent(id: string): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.IN_REVIEW) {
      throw new BadRequestException('Approve content requires IN_REVIEW status');
    }
    const report = plan.qualityReport;
    if (!isQualityReportV1(report) || !report.passed) {
      throw new BadRequestException('Quality gate must pass before approval');
    }
    assertContentPlanTransition(plan.status, ContentPlanStatus.APPROVED);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.APPROVED,
      contentApprovedAt: new Date(),
    });
    this.audit.log('plan.content.approved', { planId: id });
    return mapContentPlanDetail(updated);
  }

  async rejectContent(
    id: string,
    mode: 're-write' | 're-outline' = 're-write',
  ): Promise<ContentPlanDetailView> {
    const plan = await this.requirePlan(id);
    if (plan.status !== ContentPlanStatus.IN_REVIEW) {
      throw new BadRequestException('Reject content requires IN_REVIEW status');
    }

    const bumped = await this.bumpEpoch(id, plan.generationEpoch);

    if (mode === 're-outline') {
      assertContentPlanTransition(plan.status, ContentPlanStatus.PLANNED);
      const updated = await this.planRepository.update(id, {
        status: ContentPlanStatus.PLANNED,
        generationEpoch: bumped.generationEpoch,
        outline: Prisma.DbNull,
        articleDocument: Prisma.DbNull,
        qualityReport: Prisma.DbNull,
      });
      this.audit.log('plan.content.rejected.re-outline', { planId: id });
      return mapContentPlanDetail(updated);
    }

    assertContentPlanTransition(plan.status, ContentPlanStatus.OUTLINE_APPROVED);
    const updated = await this.planRepository.update(id, {
      status: ContentPlanStatus.OUTLINE_APPROVED,
      generationEpoch: bumped.generationEpoch,
      articleDocument: Prisma.DbNull,
      qualityReport: Prisma.DbNull,
    });
    this.audit.log('plan.content.rejected.re-write', { planId: id });
    return mapContentPlanDetail(updated);
  }

  async createCmsDraft(
    userId: string,
    id: string,
    force = false,
  ): Promise<{ cmsPageId: string; created: boolean; slug: string }> {
    // Short lock: validate only — do not hold FOR UPDATE across CMS I/O.
    const plan = await this.planRepository.transaction(async (tx) => {
      const locked = await this.planRepository.findByIdForUpdate(tx, id);
      if (!locked) throw new NotFoundException('Content plan not found');
      if (locked.status !== ContentPlanStatus.APPROVED) {
        throw new BadRequestException('Create CMS draft requires APPROVED status');
      }
      if (!isArticleDocumentV1(locked.articleDocument)) {
        throw new BadRequestException('Article document missing');
      }
      const report = locked.qualityReport;
      if (!isQualityReportV1(report) || !report.passed) {
        throw new BadRequestException('Quality gate must pass before CMS draft');
      }
      return locked;
    });

    if (!isArticleDocumentV1(plan.articleDocument)) {
      throw new BadRequestException('Article document missing');
    }

    const context = await this.contextBuilder.build(id);
    const result = await this.cmsAdapter.createOrUpdateBlogDraft(
      userId,
      plan,
      plan.articleDocument,
      context,
      force,
    );

    // Short lock: attach cmsPageId; keep existing link if another writer won the race.
    const attached = await this.planRepository.transaction(async (tx) => {
      const locked = await this.planRepository.findByIdForUpdate(tx, id);
      if (!locked) throw new NotFoundException('Content plan not found');
      if (locked.status !== ContentPlanStatus.APPROVED) {
        throw new BadRequestException('Create CMS draft requires APPROVED status');
      }

      if (locked.cmsPageId && locked.cmsPageId !== result.cmsPageId && !force) {
        if (result.created) {
          this.audit.log('plan.cms_draft.created', {
            planId: id,
            cmsPageId: locked.cmsPageId,
            created: false,
            note: 'orphan_cms_page',
            orphanCmsPageId: result.cmsPageId,
          });
        } else {
          this.audit.log('plan.cms_draft.created', {
            planId: id,
            cmsPageId: locked.cmsPageId,
            created: false,
            note: 'kept_existing_cms_link',
          });
        }
        return {
          cmsPageId: locked.cmsPageId,
          created: false,
          slug: result.slug,
        };
      }

      if (locked.cmsPageId !== result.cmsPageId) {
        await this.planRepository.updateWithClient(tx, id, { cmsPageId: result.cmsPageId });
      }

      this.audit.log('plan.cms_draft.created', {
        planId: id,
        cmsPageId: result.cmsPageId,
        created: result.created,
        resolvedSlugConflict: result.resolvedSlugConflict ?? false,
      });
      return result;
    });

    return attached;
  }

  async listAiRuns(planId: string) {
    await this.requirePlan(planId);
    const items = await this.aiRunRepository.listByPlan(planId);
    return {
      items: items.map((run) => ({
        id: run.id,
        task: run.task,
        status: run.status,
        generationEpoch: run.generationEpoch,
        provider: run.provider || null,
        model: run.model || null,
        promptVersion: run.promptVersion || null,
        tokensIn: run.tokensIn,
        tokensOut: run.tokensOut,
        costUsd: run.costUsd != null ? String(run.costUsd) : null,
        durationMs: run.durationMs,
        error: run.error,
        createdAt: run.createdAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
      })),
    };
  }

  async getAiRun(runId: string) {
    const run = await this.aiRunRepository.findById(runId);
    if (!run) throw new NotFoundException('AI run not found');
    return {
      id: run.id,
      contentPlanId: run.contentPlanId,
      task: run.task,
      status: run.status,
      generationEpoch: run.generationEpoch,
      provider: run.provider || null,
      model: run.model || null,
      promptVersion: run.promptVersion || null,
      inputHash: run.inputHash,
      contextRefs: run.contextRefs,
      outputSnapshot: run.outputSnapshot,
      tokensIn: run.tokensIn,
      tokensOut: run.tokensOut,
      costUsd: run.costUsd != null ? String(run.costUsd) : null,
      durationMs: run.durationMs,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  async getPreview(id: string): Promise<{ html: string }> {
    const plan = await this.requirePlan(id);
    if (!isArticleDocumentV1(plan.articleDocument)) {
      throw new BadRequestException('Article document missing');
    }
    const context = await this.contextBuilder.build(id);
    const pageLookup = new Map(context.existingContent.map((c) => [c.pageId, c]));
    return {
      html: renderArticleDocumentHtml(plan.articleDocument, pageLookup),
    };
  }

  private async bumpEpoch(id: string, expectedEpoch: number) {
    const bumped = await this.planRepository.incrementGenerationEpoch(id, expectedEpoch);
    if (!bumped) {
      throw new BadRequestException('Generation epoch conflict — refresh and retry');
    }
    return bumped;
  }

  private async requirePlan(id: string) {
    const plan = await this.planRepository.findById(id);
    if (!plan) throw new NotFoundException('Content plan not found');
    return plan;
  }
}
