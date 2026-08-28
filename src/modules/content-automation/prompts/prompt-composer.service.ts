import { Injectable, NotFoundException } from '@nestjs/common';
import { AiTaskType } from '@prisma/client';
import {
  CONTENT_AI_PROMPT_KEY_ANALYZE,
  CONTENT_AI_PROMPT_KEY_OUTLINE,
  CONTENT_AI_PROMPT_KEY_WRITE,
} from '../entities/content-ai.constants';
import type { GenerationContext } from '../entities/generation-context.types';
import { isIntelligenceSnapshotV1 } from '../entities/intelligence-snapshot.types';
import { isOutlineV1 } from '../entities/outline.types';
import { AiPromptRepository } from '../repositories/ai-prompt.repository';
import {
  type ComposedPrompt,
  parsePromptTemplateContent,
  renderUserTemplate,
} from './prompt-template.types';

const PROMPT_KEY_BY_TASK: Partial<Record<AiTaskType, string>> = {
  [AiTaskType.ANALYZE]: CONTENT_AI_PROMPT_KEY_ANALYZE,
  [AiTaskType.OUTLINE]: CONTENT_AI_PROMPT_KEY_OUTLINE,
  [AiTaskType.WRITE]: CONTENT_AI_PROMPT_KEY_WRITE,
};

@Injectable()
export class PromptComposerService {
  constructor(private readonly promptRepository: AiPromptRepository) {}

  async compose(task: AiTaskType, context: GenerationContext): Promise<ComposedPrompt> {
    const key = PROMPT_KEY_BY_TASK[task];
    if (!key) {
      throw new Error(`No prompt key for task ${task}`);
    }

    const row = await this.promptRepository.findActiveByKey(key);
    if (!row) {
      throw new NotFoundException(`Active prompt template not found: ${key}`);
    }

    const doc = parsePromptTemplateContent(row.content);
    const variables = this.buildVariables(context);

    return {
      key,
      version: doc.version || row.version,
      systemPrompt: doc.systemPrompt,
      userPrompt: renderUserTemplate(doc.userTemplate, variables),
      modelConfig: {
        temperature: doc.modelConfig?.temperature ?? 0.3,
        maxTokens: doc.modelConfig?.maxTokens ?? 4096,
      },
    };
  }

  buildContextRefs(context: GenerationContext): Record<string, unknown> {
    return {
      planId: context.plan.id,
      factRefIds: context.factContext.refs.map((r) => r.sourceId),
      pageIds: context.existingContent.map((c) => c.pageId),
    };
  }

  private buildVariables(context: GenerationContext): Record<string, string> {
    const { userProvided, brandContext, factContext, existingContent, internalLinkCandidates } =
      context;

    const factSummary = factContext.refs
      .map(
        (r) =>
          `- ${r.snapshot.productName} / ${r.snapshot.variantName} SKU=${r.snapshot.sku} price=${r.snapshot.sellPriceVnd}`,
      )
      .join('\n');

    const contentSummary = existingContent
      .map((c) => `- [${c.pageId}] ${c.title} (keyword: ${c.focusKeyword ?? 'n/a'})`)
      .join('\n');

    const linkSummary = internalLinkCandidates
      .filter((c) => c.validated)
      .map((c) => `- [${c.targetPageId}] ${c.anchorText}`)
      .join('\n');

    const intelligence = isIntelligenceSnapshotV1(context.plan.intelligenceSnapshot)
      ? JSON.stringify(context.plan.intelligenceSnapshot, null, 0)
      : '(none)';

    const outline = isOutlineV1(context.plan.outline)
      ? JSON.stringify(context.plan.outline, null, 0)
      : '(none)';

    return {
      topic: userProvided.topic,
      primaryKeyword: userProvided.primaryKeyword,
      searchIntent: userProvided.searchIntent,
      contentType: userProvided.contentType,
      audience: userProvided.audience ?? '',
      businessObjective: userProvided.businessObjective ?? '',
      angle: userProvided.angle ?? '',
      supportingKeywords: (userProvided.supportingKeywords ?? []).join(', '),
      siteName: brandContext.siteName,
      companyName: brandContext.companyName ?? '',
      factSummary: factSummary || '(none)',
      existingContentSummary: contentSummary || '(none)',
      linkCandidatesSummary: linkSummary || '(none)',
      intelligenceSnapshot: intelligence,
      approvedOutline: outline,
      suggestedTitle: context.plan.suggestedTitle ?? '',
    };
  }
}
