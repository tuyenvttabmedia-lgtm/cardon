import { Injectable, NotFoundException } from '@nestjs/common';
import type { ContentPlan } from '@prisma/client';
import type { GenerationContext } from '../entities/generation-context.types';
import { parsePlanReferences } from '../entities/plan-references.types';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { BrandContextService } from './brand-context.service';
import { ExistingContentContextService } from './existing-content-context.service';
import { FactContextService } from './fact-context.service';
import { InternalLinkCandidateService } from './internal-link-candidate.service';

@Injectable()
export class ContextBuilderService {
  constructor(
    private readonly planRepository: ContentPlanRepository,
    private readonly brandContext: BrandContextService,
    private readonly factContext: FactContextService,
    private readonly existingContent: ExistingContentContextService,
    private readonly linkCandidates: InternalLinkCandidateService,
  ) {}

  async build(planId: string): Promise<GenerationContext> {
    const plan = await this.planRepository.findById(planId);
    if (!plan) throw new NotFoundException('Content plan not found');
    return this.buildFromPlan(plan);
  }

  async buildFromPlan(plan: ContentPlan): Promise<GenerationContext> {
    const references = parsePlanReferences(plan.references);
    const variantIds = references.factVariantIds ?? [];

    const [brandContext, factContext, existingContent, internalLinkCandidates] =
      await Promise.all([
        this.brandContext.getBrandContext(),
        this.factContext.buildFactContext(variantIds),
        this.existingContent.findByKeyword(plan.primaryKeyword, 10),
        this.linkCandidates.listCandidates({
          keyword: plan.primaryKeyword,
          excludePageId: plan.cmsPageId ?? plan.targetPageId ?? undefined,
          limit: 20,
        }),
      ]);

    return {
      plan,
      userProvided: {
        topic: plan.topic,
        primaryKeyword: plan.primaryKeyword,
        searchIntent: plan.searchIntent,
        contentType: plan.contentType,
        audience: plan.audience,
        businessObjective: plan.businessObjective,
        supportingKeywords: references.supportingKeywords ?? [],
        angle: references.angle ?? null,
      },
      references,
      brandContext,
      factContext,
      existingContent,
      internalLinkCandidates,
      aiGenerated: {},
    };
  }
}
