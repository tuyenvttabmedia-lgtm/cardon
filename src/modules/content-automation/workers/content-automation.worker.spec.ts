import { AiRunStatus, AiTaskType } from '@prisma/client';
import { Job } from 'bullmq';
import { AiProviderError } from '../providers/ai-provider.interface';
import { AnalyzeOutputValidationError } from '../validators/analyze-output.validator';
import { CONTENT_AUTOMATION_JOB } from '../entities/content-automation.constants';
import { ContentAutomationWorker } from './content-automation.worker';

describe('ContentAutomationWorker analyze retry behavior', () => {
  const config = { isEnabled: jest.fn(() => true) };
  const aiRunRepository = {
    findById: jest.fn(),
    completeRun: jest.fn(),
  };
  const orchestrator = { execute: jest.fn() };
  const audit = { log: jest.fn() };

  let worker: ContentAutomationWorker;

  const baseJob = {
    name: CONTENT_AUTOMATION_JOB.ANALYZE,
    data: {
      planId: 'plan-1',
      task: AiTaskType.ANALYZE,
      generationEpoch: 0,
      jobName: CONTENT_AUTOMATION_JOB.ANALYZE,
      aiRunId: 'run-1',
    },
  } as Job;

  beforeEach(() => {
    jest.clearAllMocks();
    worker = new ContentAutomationWorker(
      config as never,
      aiRunRepository as never,
      orchestrator as never,
      audit as never,
    );
    aiRunRepository.findById.mockResolvedValue({ id: 'run-1', status: AiRunStatus.QUEUED });
    aiRunRepository.completeRun.mockResolvedValue({});
  });

  it('does not rethrow non-retryable validation errors (no BullMQ retry)', async () => {
    orchestrator.execute.mockRejectedValue(
      new AnalyzeOutputValidationError('relatedContent pageId not in allowed context'),
    );
    aiRunRepository.findById
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.QUEUED })
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.FAILED });

    await expect(worker.process(baseJob)).resolves.toBeUndefined();
  });

  it('rethrows retryable provider errors for BullMQ retry', async () => {
    orchestrator.execute.mockRejectedValue(
      new AiProviderError('Provider timeout', 'TIMEOUT', true),
    );
    aiRunRepository.findById
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.QUEUED })
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.FAILED });

    await expect(worker.process(baseJob)).rejects.toBeInstanceOf(AiProviderError);
  });

  it('does not rethrow non-retryable AUTH errors', async () => {
    orchestrator.execute.mockRejectedValue(new AiProviderError('Unauthorized', 'AUTH', false));
    aiRunRepository.findById
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.QUEUED })
      .mockResolvedValueOnce({ id: 'run-1', status: AiRunStatus.FAILED });

    await expect(worker.process(baseJob)).resolves.toBeUndefined();
  });

  it('cancels QUEUED ai_run when feature is disabled', async () => {
    config.isEnabled.mockReturnValue(false);
    aiRunRepository.findById.mockResolvedValue({ id: 'run-1', status: AiRunStatus.QUEUED });

    await expect(worker.process(baseJob)).resolves.toBeUndefined();

    expect(aiRunRepository.completeRun).toHaveBeenCalledWith('run-1', {
      status: AiRunStatus.CANCELLED,
      error: 'FEATURE_DISABLED',
    });
    expect(orchestrator.execute).not.toHaveBeenCalled();
  });
});
