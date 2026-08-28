import { AiRunStatus, AiTaskType, ContentPlanStatus } from '@prisma/client';
import { AiWorkerGuardService } from './ai-worker-guard.service';

describe('AiWorkerGuardService', () => {
  const planRepository = { findById: jest.fn() };
  const aiRunRepository = { completeRun: jest.fn() };
  let guard: AiWorkerGuardService;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AiWorkerGuardService(planRepository as never, aiRunRepository as never);
  });

  it('noops stale generation epoch', async () => {
    planRepository.findById.mockResolvedValue({
      id: 'plan-1',
      generationEpoch: 2,
      status: ContentPlanStatus.DRAFT,
    });

    const result = await guard.assertRunnable({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 1,
      aiRunId: 'run-1',
    });

    expect(result.noop).toBe(true);
    expect(result.reason).toBe('STALE_GENERATION_EPOCH');
    expect(aiRunRepository.completeRun).toHaveBeenCalledWith('run-1', {
      status: AiRunStatus.CANCELLED,
      error: 'STALE_GENERATION_EPOCH',
      finishedAt: expect.any(Date),
    });
  });

  it('allows matching epoch and DRAFT status', async () => {
    planRepository.findById.mockResolvedValue({
      id: 'plan-1',
      generationEpoch: 1,
      status: ContentPlanStatus.DRAFT,
    });

    const result = await guard.assertRunnable({
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 1,
    });

    expect(result.noop).toBe(false);
  });
});
