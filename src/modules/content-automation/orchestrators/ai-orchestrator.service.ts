import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiRunStatus, AiTaskType, ContentPlanStatus } from '@prisma/client';
import { ContentAiConfigService } from '../config/content-ai-config.service';
import { assertContentPlanTransition } from '../entities/content-plan-state.machine';
import type { IntelligenceSnapshotV1 } from '../entities/intelligence-snapshot.types';
import { AiWorkerGuardService } from '../guards/ai-worker-guard.service';
import { PromptComposerService } from '../prompts/prompt-composer.service';
import { OpenAiCompatibleProvider } from '../providers/openai-compatible.provider';
import { AiProviderError } from '../providers/ai-provider.interface';
import { AiRunRepository } from '../repositories/ai-run.repository';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { ContentAutomationAuditService, type ContentAutomationAuditEvent } from '../services/content-automation-audit.service';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';
import { ContextBuilderService } from '../services/context-builder.service';
import { HeuristicAnalyzeStrategy } from '../strategies/heuristic-analyze.strategy';
import { buildInputHash, estimateCostUsd } from '../utils/input-hash.util';
import type { OutlineV1 } from '../entities/outline.types';
import type { ArticleDocumentV1 } from '../entities/article-document.types';
import { HeuristicOutlineStrategy } from '../strategies/heuristic-outline.strategy';
import { HeuristicWriteStrategy } from '../strategies/heuristic-write.strategy';
import { QualityGateService } from '../services/quality-gate.service';
import { cleanSeoArticleTitle } from '../utils/cms-title-category.util';
import {
  AnalyzeOutputValidationError,
  validateAndBuildAiSnapshot,
} from '../validators/analyze-output.validator';
import { OutlineOutputValidationError, validateAndBuildOutline } from '../validators/outline-output.validator';
import {
  ArticleDocumentValidationError,
  validateAndBuildArticleDocument,
  validateArticleDocumentLayer1,
} from '../validators/article-document.validator';

export interface AiOrchestratorInput {
  planId: string;
  task: AiTaskType;
  generationEpoch: number;
  aiRunId?: string;
}

export interface AiOrchestratorResult {
  noop: boolean;
  source?: 'AI' | 'HEURISTIC';
  snapshot?: IntelligenceSnapshotV1;
  transitioned?: boolean;
  reason?: string;
}

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly guard: AiWorkerGuardService,
    private readonly contextBuilder: ContextBuilderService,
    private readonly featureConfig: ContentAutomationConfigService,
    private readonly aiConfig: ContentAiConfigService,
    private readonly promptComposer: PromptComposerService,
    private readonly aiProvider: OpenAiCompatibleProvider,
    private readonly heuristic: HeuristicAnalyzeStrategy,
    private readonly heuristicOutline: HeuristicOutlineStrategy,
    private readonly heuristicWrite: HeuristicWriteStrategy,
    private readonly qualityGate: QualityGateService,
    private readonly planRepository: ContentPlanRepository,
    private readonly aiRunRepository: AiRunRepository,
    private readonly audit: ContentAutomationAuditService,
  ) {}

  async execute(input: AiOrchestratorInput): Promise<AiOrchestratorResult> {
    const guardResult = await this.guard.assertRunnable(input);
    if (guardResult.noop) {
      return { noop: true, reason: guardResult.reason };
    }

    const plan = await this.planRepository.findById(input.planId);
    if (!plan) {
      throw new Error('Content plan not found');
    }

    const context = await this.contextBuilder.buildFromPlan(plan);

    switch (input.task) {
      case AiTaskType.ANALYZE:
        return this.executeAnalyze(input, plan, context);
      case AiTaskType.OUTLINE:
        return this.executeOutline(input, plan, context);
      case AiTaskType.WRITE:
        return this.executeWrite(input, plan, context);
      default:
        throw new Error(`Task ${input.task} not implemented`);
    }
  }

  private async executeAnalyze(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const aiConfigured = await this.aiConfig.isConfigured();
    if (!aiConfigured) {
      return this.runHeuristicOrReject(input, 'AI_NOT_CONFIGURED', () =>
        this.runHeuristicAnalyze(input, context, plan.suggestedTitle),
      );
    }
    return this.runAiAnalyze(input, context, plan.suggestedTitle);
  }

  private async executeOutline(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const aiConfigured = await this.aiConfig.isConfigured();
    if (!aiConfigured) {
      return this.runHeuristicOrReject(input, 'AI_NOT_CONFIGURED', () =>
        this.runHeuristicOutline(input, plan, context),
      );
    }
    return this.runAiOutline(input, plan, context);
  }

  private async executeWrite(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const aiConfigured = await this.aiConfig.isConfigured();
    if (!aiConfigured) {
      return this.runHeuristicOrReject(input, 'AI_NOT_CONFIGURED', () =>
        this.runHeuristicWrite(input, plan, context),
      );
    }
    return this.runAiWrite(input, plan, context);
  }

  /**
   * Heuristic is opt-in via CONTENT_AUTOMATION_ALLOW_HEURISTIC_FALLBACK=true.
   * Default: fail the run so operators do not treat skeleton output as AI success.
   */
  private async runHeuristicOrReject(
    input: AiOrchestratorInput,
    reason: string,
    run: () => Promise<AiOrchestratorResult>,
  ): Promise<AiOrchestratorResult> {
    if (this.featureConfig.isHeuristicFallbackAllowed()) {
      return run();
    }
    const message = `HEURISTIC_FALLBACK_DISABLED: ${reason}`;
    this.logger.warn(`${message} plan=${input.planId} task=${input.task}`);
    await this.completeRun(input.aiRunId, {
      status: AiRunStatus.FAILED,
      provider: 'heuristic',
      error: message.slice(0, 500),
    });
    this.audit.log('plan.ai.failed', {
      planId: input.planId,
      task: input.task,
      error: message,
      source: 'HEURISTIC',
    });
    throw new Error(message);
  }

  private async runHeuristicAnalyze(
    input: AiOrchestratorInput,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
    suggestedTitle: string | null,
  ): Promise<AiOrchestratorResult> {
    const snapshot = this.heuristic.buildSnapshot(context);
    const transitioned = await this.persistAnalyzeResult(
      input.planId,
      input.generationEpoch,
      snapshot,
      suggestedTitle,
    );

    await this.completeRun(input.aiRunId, {
      status: AiRunStatus.SUCCEEDED,
      provider: 'heuristic',
      model: 'm2-heuristic',
      promptVersion: 'heuristic-m2',
      outputSnapshot: {
        source: 'HEURISTIC',
        cannibalizationRisk: snapshot.cannibalization.risk,
      },
    });

    this.audit.log('plan.analyze.completed', {
      planId: input.planId,
      source: 'HEURISTIC',
      cannibalizationRisk: snapshot.cannibalization.risk,
    });

    return { noop: false, source: 'HEURISTIC', snapshot, transitioned };
  }

  private async runAiAnalyze(
    input: AiOrchestratorInput,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
    suggestedTitle: string | null,
  ): Promise<AiOrchestratorResult> {
    const cfg = await this.aiConfig.resolveConfig();
    if (!cfg) {
      return this.runHeuristicOrReject(input, 'AI_CONFIG_UNRESOLVED', () =>
        this.runHeuristicAnalyze(input, context, suggestedTitle),
      );
    }

    let prompt;
    try {
      prompt = await this.promptComposer.compose(AiTaskType.ANALYZE, context);
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.logger.warn(
          `Active analyze prompt missing — heuristic fallback plan=${input.planId}`,
        );
        return this.runHeuristicOrReject(input, 'ANALYZE_PROMPT_MISSING', () =>
          this.runHeuristicAnalyze(input, context, suggestedTitle),
        );
      }
      throw err;
    }

    const inputHash = buildInputHash(prompt.systemPrompt, prompt.userPrompt);
    const contextRefs = this.promptComposer.buildContextRefs(context);

    if (input.aiRunId) {
      await this.aiRunRepository.completeRun(input.aiRunId, {
        status: AiRunStatus.RUNNING,
        provider: cfg.providerId,
        model: cfg.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
      });
    }

    let lastRawPreview: string | null = null;
    let lastResponseKeys: string | null = null;
    try {
      const response = await this.aiProvider.complete({
        model: cfg.model,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        timeoutMs: cfg.timeoutMs,
        maxTokens: prompt.modelConfig.maxTokens,
        temperature: prompt.modelConfig.temperature,
        jsonMode: true,
      });

      lastRawPreview = response.rawText.slice(0, 1500);
      lastResponseKeys =
        response.parsedJson &&
        typeof response.parsedJson === 'object' &&
        !Array.isArray(response.parsedJson)
          ? Object.keys(response.parsedJson as object).slice(0, 30).join(',')
          : typeof response.parsedJson;

      const snapshot = validateAndBuildAiSnapshot(response.parsedJson, context);
      const transitioned = await this.persistAnalyzeResult(
        input.planId,
        input.generationEpoch,
        snapshot,
        suggestedTitle,
      );

      const costUsd = estimateCostUsd(response.model, response.tokensIn, response.tokensOut);

      await this.completeRun(input.aiRunId, {
        status: AiRunStatus.SUCCEEDED,
        provider: cfg.providerId,
        model: response.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
        outputSnapshot: {
          source: 'AI',
          cannibalizationRisk: snapshot.cannibalization.risk,
        },
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        costUsd: costUsd ?? null,
        durationMs: response.latencyMs,
      });

      this.audit.log('plan.analyze.completed', {
        planId: input.planId,
        source: 'AI',
        model: response.model,
        cannibalizationRisk: snapshot.cannibalization.risk,
      });

      return { noop: false, source: 'AI', snapshot, transitioned };
    } catch (err) {
      const message =
        err instanceof AnalyzeOutputValidationError || err instanceof AiProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'AI analyze failed';

      this.logger.warn(`AI analyze failed plan=${input.planId}: ${message}`);

      await this.completeRun(input.aiRunId, {
        status: AiRunStatus.FAILED,
        provider: cfg.providerId,
        model: cfg.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
        error: message.slice(0, 500),
        outputSnapshot: {
          source: 'AI',
          validationError: message.slice(0, 300),
          responseKeys: lastResponseKeys,
          rawPreview: lastRawPreview,
        },
      });

      this.audit.log('plan.analyze.failed', { planId: input.planId, source: 'AI', error: message });
      throw err;
    }
  }

  private async persistAnalyzeResult(
    planId: string,
    generationEpoch: number,
    snapshot: IntelligenceSnapshotV1,
    existingSuggestedTitle: string | null,
  ): Promise<boolean> {
    const plan = await this.planRepository.findById(planId);
    if (!plan) {
      throw new Error('Content plan not found');
    }
    if (plan.generationEpoch !== generationEpoch) {
      return false;
    }

    const suggestedTitle = existingSuggestedTitle ?? this.heuristic.suggestTitle(plan);
    const updated = await this.planRepository.updateIfGenerationEpoch(planId, generationEpoch, {
      intelligenceSnapshot: snapshot as object,
      suggestedTitle,
      ...(plan.status === ContentPlanStatus.DRAFT
        ? { status: ContentPlanStatus.PLANNED }
        : {}),
    });

    if (!updated) return false;
    return plan.status === ContentPlanStatus.DRAFT;
  }

  private async completeRun(
    aiRunId: string | undefined,
    data: Parameters<AiRunRepository['completeRun']>[1],
  ): Promise<void> {
    if (!aiRunId) return;
    await this.aiRunRepository.completeRun(aiRunId, data);
  }

  private async runHeuristicOutline(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const outline = this.heuristicOutline.buildOutline(plan, context);
    const transitioned = await this.persistOutlineResult(
      input.planId,
      input.generationEpoch,
      outline,
    );
    await this.completeRun(input.aiRunId, {
      status: AiRunStatus.SUCCEEDED,
      provider: 'heuristic',
      model: 'm4-heuristic-outline',
      promptVersion: 'heuristic-outline',
      outputSnapshot: { source: 'HEURISTIC', sectionCount: outline.sections.length },
    });
    this.audit.log('plan.outline.completed', { planId: input.planId, source: 'HEURISTIC' });
    return { noop: false, source: 'HEURISTIC', transitioned };
  }

  private async runAiOutline(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const cfg = await this.aiConfig.resolveConfig();
    if (!cfg) {
      return this.runHeuristicOrReject(input, 'AI_CONFIG_UNRESOLVED', () =>
        this.runHeuristicOutline(input, plan, context),
      );
    }

    let prompt;
    try {
      prompt = await this.promptComposer.compose(AiTaskType.OUTLINE, context);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return this.runHeuristicOrReject(input, 'OUTLINE_PROMPT_MISSING', () =>
          this.runHeuristicOutline(input, plan, context),
        );
      }
      throw err;
    }

    return this.runAiJsonTask(input, cfg, prompt, context, async (parsed) => {
      const outline = validateAndBuildOutline(parsed, 'AI');
      const transitioned = await this.persistOutlineResult(
        input.planId,
        input.generationEpoch,
        outline,
      );
      return {
        outputSnapshot: { source: 'AI', sectionCount: outline.sections.length },
        auditEvent: 'plan.outline.completed',
        transitioned,
        source: 'AI' as const,
      };
    }, 'AI outline failed');
  }

  private async runHeuristicWrite(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const doc = this.heuristicWrite.buildArticle(plan, context);
    const report = await this.qualityGate.runGateAsync(plan, doc, context);
    if (!report.passed) {
      throw new Error(`Quality gate failed: ${report.checks.filter((c) => !c.passed).map((c) => c.code).join(', ')}`);
    }
    const transitioned = await this.persistWriteResult(
      input.planId,
      input.generationEpoch,
      doc,
      report,
    );
    await this.completeRun(input.aiRunId, {
      status: AiRunStatus.SUCCEEDED,
      provider: 'heuristic',
      model: 'm4-heuristic-write',
      promptVersion: 'heuristic-write',
      outputSnapshot: { source: 'HEURISTIC', qualityPassed: report.passed },
    });
    this.audit.log('plan.write.completed', { planId: input.planId, source: 'HEURISTIC' });
    return { noop: false, source: 'HEURISTIC', transitioned };
  }

  private async runAiWrite(
    input: AiOrchestratorInput,
    plan: NonNullable<Awaited<ReturnType<ContentPlanRepository['findById']>>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
  ): Promise<AiOrchestratorResult> {
    const cfg = await this.aiConfig.resolveConfig();
    if (!cfg) {
      return this.runHeuristicOrReject(input, 'AI_CONFIG_UNRESOLVED', () =>
        this.runHeuristicWrite(input, plan, context),
      );
    }

    let prompt;
    try {
      prompt = await this.promptComposer.compose(AiTaskType.WRITE, context);
    } catch (err) {
      if (err instanceof NotFoundException) {
        return this.runHeuristicOrReject(input, 'WRITE_PROMPT_MISSING', () =>
          this.runHeuristicWrite(input, plan, context),
        );
      }
      throw err;
    }

    return this.runAiJsonTask(input, cfg, prompt, context, async (parsed) => {
      const doc = validateAndBuildArticleDocument(parsed, context, 'AI');
      validateArticleDocumentLayer1(doc);
      const report = await this.qualityGate.runGateAsync(plan, doc, context);
      if (!report.passed) {
        throw new Error(`Quality gate failed: ${report.checks.filter((c) => !c.passed).map((c) => c.code).join(', ')}`);
      }
      const transitioned = await this.persistWriteResult(
        input.planId,
        input.generationEpoch,
        doc,
        report,
      );
      return {
        outputSnapshot: { source: 'AI', qualityPassed: report.passed },
        auditEvent: 'plan.write.completed',
        transitioned,
        source: 'AI' as const,
      };
    }, 'AI write failed');
  }

  private async runAiJsonTask(
    input: AiOrchestratorInput,
    cfg: NonNullable<Awaited<ReturnType<ContentAiConfigService['resolveConfig']>>>,
    prompt: Awaited<ReturnType<PromptComposerService['compose']>>,
    context: Awaited<ReturnType<ContextBuilderService['buildFromPlan']>>,
    onSuccess: (parsed: unknown) => Promise<{
      outputSnapshot: Record<string, unknown>;
      auditEvent: ContentAutomationAuditEvent;
      transitioned: boolean;
      source: 'AI';
    }>,
    failLabel: string,
  ): Promise<AiOrchestratorResult> {
    const inputHash = buildInputHash(prompt.systemPrompt, prompt.userPrompt);
    const contextRefs = this.promptComposer.buildContextRefs(context);

    if (input.aiRunId) {
      await this.aiRunRepository.completeRun(input.aiRunId, {
        status: AiRunStatus.RUNNING,
        provider: cfg.providerId,
        model: cfg.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
      });
    }

    let lastRawPreview: string | null = null;
    let lastResponseKeys: string | null = null;
    try {
      const response = await this.aiProvider.complete({
        model: cfg.model,
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        timeoutMs: cfg.timeoutMs,
        maxTokens: prompt.modelConfig.maxTokens,
        temperature: prompt.modelConfig.temperature,
        jsonMode: true,
      });

      lastRawPreview = response.rawText.slice(0, 1500);
      lastResponseKeys =
        response.parsedJson &&
        typeof response.parsedJson === 'object' &&
        !Array.isArray(response.parsedJson)
          ? Object.keys(response.parsedJson as object).slice(0, 30).join(',')
          : typeof response.parsedJson;

      const result = await onSuccess(response.parsedJson);
      const costUsd = estimateCostUsd(response.model, response.tokensIn, response.tokensOut);

      await this.completeRun(input.aiRunId, {
        status: AiRunStatus.SUCCEEDED,
        provider: cfg.providerId,
        model: response.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
        outputSnapshot: result.outputSnapshot as object,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        costUsd: costUsd ?? null,
        durationMs: response.latencyMs,
      });

      this.audit.log(result.auditEvent, { planId: input.planId, source: 'AI', model: response.model });
      return { noop: false, source: result.source, transitioned: result.transitioned };
    } catch (err) {
      const message =
        err instanceof AnalyzeOutputValidationError ||
        err instanceof OutlineOutputValidationError ||
        err instanceof ArticleDocumentValidationError ||
        err instanceof AiProviderError
          ? err.message
          : err instanceof Error
            ? err.message
            : failLabel;

      this.logger.warn(`${failLabel} plan=${input.planId}: ${message}`);

      await this.completeRun(input.aiRunId, {
        status: AiRunStatus.FAILED,
        provider: cfg.providerId,
        model: cfg.model,
        promptVersion: prompt.version,
        inputHash,
        contextRefs: contextRefs as object,
        error: message.slice(0, 500),
        outputSnapshot: {
          source: 'AI',
          validationError: message.slice(0, 300),
          responseKeys: lastResponseKeys,
          rawPreview: lastRawPreview,
        },
      });

      this.audit.log('plan.analyze.failed', {
        planId: input.planId,
        source: 'AI',
        error: message,
        task: input.task,
      });
      throw err;
    }
  }

  private async persistOutlineResult(
    planId: string,
    generationEpoch: number,
    outline: OutlineV1,
  ): Promise<boolean> {
    const plan = await this.planRepository.findById(planId);
    if (!plan) throw new Error('Content plan not found');
    if (plan.generationEpoch !== generationEpoch) return false;

    const shouldTransition = plan.status === ContentPlanStatus.PLANNED;
    if (shouldTransition) {
      assertContentPlanTransition(plan.status, ContentPlanStatus.OUTLINE_READY);
    }

    const updated = await this.planRepository.updateIfGenerationEpoch(planId, generationEpoch, {
      outline: outline as object,
      ...(shouldTransition ? { status: ContentPlanStatus.OUTLINE_READY } : {}),
    });

    return Boolean(updated && shouldTransition);
  }

  private async persistWriteResult(
    planId: string,
    generationEpoch: number,
    doc: ArticleDocumentV1,
    report: Awaited<ReturnType<QualityGateService['runGateAsync']>>,
  ): Promise<boolean> {
    const plan = await this.planRepository.findById(planId);
    if (!plan) throw new Error('Content plan not found');
    if (plan.generationEpoch !== generationEpoch) return false;

    const shouldTransition = plan.status === ContentPlanStatus.OUTLINE_APPROVED;
    if (shouldTransition) {
      assertContentPlanTransition(plan.status, ContentPlanStatus.CONTENT_READY);
      if (report.passed) {
        assertContentPlanTransition(ContentPlanStatus.CONTENT_READY, ContentPlanStatus.IN_REVIEW);
      }
    }

    // When quality already passed during write, advance to IN_REVIEW (spec §6).
    const nextStatus = shouldTransition
      ? report.passed
        ? ContentPlanStatus.IN_REVIEW
        : ContentPlanStatus.CONTENT_READY
      : undefined;

    const cleanedTitle = cleanSeoArticleTitle(doc.title, plan.topic);
    const cleanedDoc =
      cleanedTitle === doc.title
        ? doc
        : {
            ...doc,
            title: cleanedTitle,
            seo: {
              ...doc.seo,
              metaTitle: cleanSeoArticleTitle(doc.seo.metaTitle, cleanedTitle),
            },
          };

    const updated = await this.planRepository.updateIfGenerationEpoch(planId, generationEpoch, {
      articleDocument: cleanedDoc as object,
      qualityReport: report as object,
      suggestedTitle: cleanedTitle,
      ...(nextStatus ? { status: nextStatus } : {}),
    });

    return Boolean(updated && shouldTransition);
  }
}
