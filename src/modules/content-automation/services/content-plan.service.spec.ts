import { Test, TestingModule } from '@nestjs/testing';
import { ContentPlanStatus } from '@prisma/client';
import { ContentPlanService } from './content-plan.service';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { AiRunRepository } from '../repositories/ai-run.repository';
import { ContentAutomationQueueProducer } from '../producers/content-automation-queue.producer';
import { ContextBuilderService } from './context-builder.service';
import { ContentAutomationAuditService } from './content-automation-audit.service';
import { QualityGateService } from './quality-gate.service';
import { ContentAutomationCmsAdapter } from './content-automation-cms.adapter';

describe('ContentPlanService', () => {
  let service: ContentPlanService;
  const planRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
  };
  const aiRunRepository = {
    listByPlan: jest.fn(),
    findById: jest.fn(),
  };
  const queueProducer = { enqueueAnalyze: jest.fn() };
  const contextBuilder = { build: jest.fn() };
  const audit = { log: jest.fn() };
  const qualityGate = { runGate: jest.fn(), runGateAsync: jest.fn() };
  const cmsAdapter = { createOrUpdateBlogDraft: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContentPlanService,
        { provide: ContentPlanRepository, useValue: planRepository },
        { provide: AiRunRepository, useValue: aiRunRepository },
        { provide: ContentAutomationQueueProducer, useValue: queueProducer },
        { provide: ContextBuilderService, useValue: contextBuilder },
        { provide: ContentAutomationAuditService, useValue: audit },
        { provide: QualityGateService, useValue: qualityGate },
        { provide: ContentAutomationCmsAdapter, useValue: cmsAdapter },
      ],
    }).compile();

    service = module.get(ContentPlanService);
  });

  it('creates plan in DRAFT status', async () => {
    planRepository.create.mockResolvedValue({
      id: 'plan-1',
      status: ContentPlanStatus.DRAFT,
      action: 'CREATE',
      topic: 'Test topic',
      primaryKeyword: 'keyword',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
      priority: 'MEDIUM',
      suggestedTitle: null,
      generationEpoch: 0,
      audience: null,
      businessObjective: null,
      sourceType: 'MANUAL',
      sourceRefId: null,
      cmsPageId: null,
      targetPageId: null,
      references: {},
      intelligenceSnapshot: null,
      outlineApprovedAt: null,
      contentApprovedAt: null,
      publishedAt: null,
      createdById: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const result = await service.create('user-1', {
      topic: 'Test topic',
      primaryKeyword: 'keyword',
      searchIntent: 'INFORMATIONAL',
      contentType: 'GUIDE',
    });

    expect(result.status).toBe('DRAFT');
    expect(planRepository.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith('plan.created', expect.any(Object));
  });

  it('rejects analyze when plan is not DRAFT', async () => {
    planRepository.findById.mockResolvedValue({
      id: 'plan-1',
      status: ContentPlanStatus.PLANNED,
      generationEpoch: 0,
    });

    await expect(service.requestAnalyze('plan-1')).rejects.toThrow(
      'Analyze is only allowed for DRAFT plans',
    );
  });

  it('enqueues analyze for DRAFT plan', async () => {
    planRepository.findById.mockResolvedValue({
      id: 'plan-1',
      status: ContentPlanStatus.DRAFT,
      generationEpoch: 0,
    });
    queueProducer.enqueueAnalyze.mockResolvedValue({ jobId: 'job-1', aiRunId: 'run-1' });

    const result = await service.requestAnalyze('plan-1');
    expect(result.jobId).toBe('job-1');
    expect(queueProducer.enqueueAnalyze).toHaveBeenCalledWith('plan-1', 0);
  });
});
