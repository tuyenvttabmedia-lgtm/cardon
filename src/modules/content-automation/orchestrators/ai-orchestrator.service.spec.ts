import { AiRunStatus, AiTaskType, ContentPlanStatus } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { AnalyzeOutputValidationError } from '../validators/analyze-output.validator';
describe('AiOrchestratorService', () => {
  const guard = { assertRunnable: jest.fn() };
  const contextBuilder = { buildFromPlan: jest.fn() };
  const aiConfig = { isConfigured: jest.fn(), resolveConfig: jest.fn() };
  const promptComposer = {
    compose: jest.fn(),
    buildContextRefs: jest.fn(() => ({ planId: 'plan-1', pageIds: ['p1'] })),
  };
  const aiProvider = { complete: jest.fn() };
  const heuristic = {
    buildSnapshot: jest.fn(),
    suggestTitle: jest.fn(() => 'Suggested'),
  };
  const heuristicOutline = { buildOutline: jest.fn() };
  const heuristicWrite = { buildArticle: jest.fn() };
  const qualityGate = { runGate: jest.fn() };
  const planRepository = {
    findById: jest.fn(),
    update: jest.fn(),
    updateIfGenerationEpoch: jest.fn(),
  };
  const aiRunRepository = { completeRun: jest.fn() };
  const audit = { log: jest.fn() };

  let orchestrator: AiOrchestratorService;

  const basePlan = {
    id: 'plan-1',
    status: ContentPlanStatus.DRAFT,
    generationEpoch: 0,
    topic: 'Topic',
    primaryKeyword: 'keyword',
    contentType: 'GUIDE',
    suggestedTitle: null,
  };

  const baseContext = {
    plan: basePlan,
    userProvided: {
      topic: 'Topic',
      primaryKeyword: 'keyword',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
      audience: null,
      businessObjective: null,
      supportingKeywords: [],
      angle: null,
    },
    references: {},
    brandContext: { siteName: 'CardOn', publicUrl: '', siteTitle: null, metaDescription: null, companyName: null, hotline: null, email: null, address: null, source: 'CMS_THEME' as const },
    factContext: { refs: [], source: 'BACKEND' as const },
    existingContent: [
      {
        pageId: 'p1',
        title: 'Existing',
        slug: 'existing',
        type: 'BLOG_POST',
        status: 'PUBLISHED',
        categorySlug: 'cat',
        focusKeyword: 'keyword',
        publicPath: '/tin-tuc/cat/existing',
      },
    ],
    internalLinkCandidates: [
      {
        targetPageId: 'p1',
        anchorText: 'Existing',
        reason: 'test',
        confidence: 0.8,
        validated: true,
        publicPath: '/tin-tuc/cat/existing',
      },
    ],
    aiGenerated: {},
  };

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new AiOrchestratorService(
      guard as never,
      contextBuilder as never,
      aiConfig as never,
      promptComposer as never,
      aiProvider as never,
      heuristic as never,
      heuristicOutline as never,
      heuristicWrite as never,
      qualityGate as never,
      planRepository as never,
      aiRunRepository as never,
      audit as never,
    );

    guard.assertRunnable.mockResolvedValue({ noop: false });
    contextBuilder.buildFromPlan.mockResolvedValue(baseContext);
    planRepository.findById.mockResolvedValue(basePlan);
    planRepository.update.mockResolvedValue({});
    planRepository.updateIfGenerationEpoch.mockImplementation(
      async (_id: string, _epoch: number, data: object) => ({ ...basePlan, ...data }),
    );
  });

  it('returns noop when epoch guard fails', async () => {
    guard.assertRunnable.mockResolvedValue({ noop: true, reason: 'STALE_GENERATION_EPOCH' });

    const result = await orchestrator.execute({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      aiRunId: 'run-1',
    });

    expect(result.noop).toBe(true);
    expect(aiProvider.complete).not.toHaveBeenCalled();
  });

  it('uses heuristic fallback when AI not configured', async () => {
    aiConfig.isConfigured.mockResolvedValue(false);
    heuristic.buildSnapshot.mockReturnValue({
      version: '1',
      analyzedAt: new Date().toISOString(),
      source: 'HEURISTIC',
      input: { topic: 'Topic', primaryKeyword: 'keyword' },
      relatedContent: [],
      cannibalization: { risk: 'NONE', matches: [] },
      recommendations: [],
      internalLinkCandidates: [],
    });

    const result = await orchestrator.execute({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      aiRunId: 'run-1',
    });

    expect(result.source).toBe('HEURISTIC');
    expect(aiProvider.complete).not.toHaveBeenCalled();
    expect(aiRunRepository.completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: AiRunStatus.SUCCEEDED, provider: 'heuristic' }),
    );
  });

  it('persists AI snapshot with source AI on success', async () => {
    aiConfig.isConfigured.mockResolvedValue(true);
    aiConfig.resolveConfig.mockResolvedValue({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });
    promptComposer.compose.mockResolvedValue({
      key: 'content.analyze',
      version: '1.0.0',
      systemPrompt: 'system',
      userPrompt: 'user',
      modelConfig: { temperature: 0.3, maxTokens: 1000 },
    });
    aiProvider.complete.mockResolvedValue({
      rawText: '{}',
      parsedJson: {
        relatedContent: [
          { pageId: 'p1', title: 'Existing', similarityScore: 0.9, reason: 'match' },
        ],
        cannibalization: { risk: 'LOW', matches: [] },
        recommendations: [
          { action: 'CREATE', pageId: null, confidence: 0.8, reason: 'ok' },
        ],
        internalLinkCandidates: [{ pageId: 'p1', title: 'Existing', relevanceScore: 0.8 }],
      },
      tokensIn: 100,
      tokensOut: 50,
      model: 'gpt-4.1-mini',
      latencyMs: 200,
    });

    const result = await orchestrator.execute({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      aiRunId: 'run-1',
    });

    expect(result.source).toBe('AI');
    expect(result.snapshot?.source).toBe('AI');
    expect(planRepository.updateIfGenerationEpoch).toHaveBeenCalledWith(
      'plan-1',
      0,
      expect.objectContaining({
        intelligenceSnapshot: expect.objectContaining({ source: 'AI' }),
      }),
    );
    expect(aiRunRepository.completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: AiRunStatus.SUCCEEDED,
        provider: 'openai-compatible',
        model: 'gpt-4.1-mini',
        tokensIn: 100,
        tokensOut: 50,
      }),
    );
  });

  it('fails when AI output validation fails', async () => {
    aiConfig.isConfigured.mockResolvedValue(true);
    aiConfig.resolveConfig.mockResolvedValue({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });
    promptComposer.compose.mockResolvedValue({
      key: 'content.analyze',
      version: '1.0.0',
      systemPrompt: 'system',
      userPrompt: 'user',
      modelConfig: { temperature: 0.3, maxTokens: 1000 },
    });
    aiProvider.complete.mockResolvedValue({
      rawText: '{}',
      parsedJson: {
        relatedContent: [
          { pageId: 'unknown-page', title: 'Bad', similarityScore: 0.9, reason: 'x' },
        ],
        cannibalization: { risk: 'NONE', matches: [] },
        recommendations: [],
        internalLinkCandidates: [],
      },
      tokensIn: 10,
      tokensOut: 10,
      model: 'gpt-4.1-mini',
      latencyMs: 100,
    });

    await expect(
      orchestrator.execute({
        planId: 'plan-1',
        task: AiTaskType.ANALYZE,
        generationEpoch: 0,
        aiRunId: 'run-1',
      }),
    ).rejects.toBeInstanceOf(AnalyzeOutputValidationError);

    expect(aiRunRepository.completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: AiRunStatus.FAILED }),
    );
  });

  it('falls back to heuristic when analyze prompt template is missing', async () => {
    aiConfig.isConfigured.mockResolvedValue(true);
    aiConfig.resolveConfig.mockResolvedValue({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });
    promptComposer.compose.mockRejectedValue(
      new NotFoundException('Active prompt template not found: content.analyze'),
    );
    heuristic.buildSnapshot.mockReturnValue({
      version: '1',
      analyzedAt: new Date().toISOString(),
      source: 'HEURISTIC',
      input: { topic: 'Topic', primaryKeyword: 'keyword' },
      relatedContent: [],
      cannibalization: { risk: 'NONE', matches: [] },
      recommendations: [],
      internalLinkCandidates: [],
    });

    const result = await orchestrator.execute({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      aiRunId: 'run-1',
    });

    expect(result.source).toBe('HEURISTIC');
    expect(aiProvider.complete).not.toHaveBeenCalled();
    expect(aiRunRepository.completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: AiRunStatus.SUCCEEDED, provider: 'heuristic' }),
    );
  });

  it('stores null token usage and cost when provider omits usage', async () => {
    aiConfig.isConfigured.mockResolvedValue(true);
    aiConfig.resolveConfig.mockResolvedValue({
      providerId: 'openai-compatible',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4.1-mini',
      apiKey: 'sk-test',
      timeoutMs: 1000,
      maxTokens: 1000,
      temperature: 0.3,
    });
    promptComposer.compose.mockResolvedValue({
      key: 'content.analyze',
      version: '1.0.0',
      systemPrompt: 'system',
      userPrompt: 'user',
      modelConfig: { temperature: 0.3, maxTokens: 1000 },
    });
    aiProvider.complete.mockResolvedValue({
      rawText: '{}',
      parsedJson: {
        relatedContent: [
          { pageId: 'p1', title: 'Existing', similarityScore: 0.9, reason: 'match' },
        ],
        cannibalization: { risk: 'LOW', matches: [] },
        recommendations: [
          { action: 'CREATE', pageId: null, confidence: 0.8, reason: 'ok' },
        ],
        internalLinkCandidates: [{ pageId: 'p1', title: 'Existing', relevanceScore: 0.8 }],
      },
      tokensIn: null,
      tokensOut: null,
      model: 'gpt-4.1-mini',
      latencyMs: 200,
    });

    await orchestrator.execute({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      aiRunId: 'run-1',
    });

    expect(aiRunRepository.completeRun).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        status: AiRunStatus.SUCCEEDED,
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
      }),
    );
  });
});
