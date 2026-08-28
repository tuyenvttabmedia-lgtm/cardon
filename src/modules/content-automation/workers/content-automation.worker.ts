import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { AiRunStatus, AiTaskType } from '@prisma/client';
import { Job } from 'bullmq';
import { shouldRegisterWorkers } from '../../../config/process-role';
import {
  CONTENT_AUTOMATION_JOB,
  CONTENT_AUTOMATION_JOB_TIMEOUT_MS,
  CONTENT_AUTOMATION_LOCK_DURATION_MS,
  CONTENT_AUTOMATION_QUEUE,
} from '../entities/content-automation.constants';
import { ContentAutomationQueueJobData } from '../entities/content-automation.types';
import { AiOrchestratorService } from '../orchestrators/ai-orchestrator.service';
import { AiProviderError } from '../providers/ai-provider.interface';
import { AiRunRepository } from '../repositories/ai-run.repository';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';
import { ContentAutomationAuditService } from '../services/content-automation-audit.service';
import { isAnalyzeJobRetryable } from '../utils/analyze-error.util';
import { withTimeout } from '../utils/with-timeout.util';

type ContentAutomationJobPayload = ContentAutomationQueueJobData & {
  aiRunId?: string;
};

@Processor(CONTENT_AUTOMATION_QUEUE, {
  concurrency: 1,
  lockDuration: CONTENT_AUTOMATION_LOCK_DURATION_MS,
})
export class ContentAutomationWorker extends WorkerHost {
  private readonly logger = new Logger(ContentAutomationWorker.name);

  constructor(
    private readonly config: ContentAutomationConfigService,
    private readonly aiRunRepository: AiRunRepository,
    private readonly orchestrator: AiOrchestratorService,
    private readonly audit: ContentAutomationAuditService,
  ) {
    super();
  }

  async process(job: Job<ContentAutomationJobPayload>): Promise<void> {
    const aiRunId = job.data.aiRunId;

    if (!this.config.isEnabled()) {
      this.logger.warn(
        `Content Automation worker received job while feature disabled — cancelling run ${aiRunId ?? 'n/a'}`,
      );
      if (aiRunId) {
        const run = await this.aiRunRepository.findById(aiRunId);
        if (run && (run.status === AiRunStatus.QUEUED || run.status === AiRunStatus.RUNNING)) {
          await this.aiRunRepository.completeRun(aiRunId, {
            status: AiRunStatus.CANCELLED,
            error: 'FEATURE_DISABLED',
          });
        }
      }
      // Complete the BullMQ job (no retry) so it does not leave QUEUED forever.
      return;
    }

    if (aiRunId) {
      const run = await this.aiRunRepository.findById(aiRunId);
      if (run?.status === AiRunStatus.SUCCEEDED) {
        this.logger.log(`Skipping already succeeded run ${aiRunId}`);
        return;
      }
      if (run?.status === AiRunStatus.CANCELLED) {
        this.logger.log(`Skipping cancelled run ${aiRunId}`);
        return;
      }
    }

    if (job.name === CONTENT_AUTOMATION_JOB.PING) {
      this.logger.log(
        `PING job processed for plan=${job.data.planId} epoch=${job.data.generationEpoch}`,
      );
      if (aiRunId) {
        await this.aiRunRepository.completeRun(aiRunId, {
          status: AiRunStatus.SUCCEEDED,
        });
      }
      return;
    }

    if (job.name === CONTENT_AUTOMATION_JOB.ANALYZE) {
      await this.processAiJob(job, aiRunId, AiTaskType.ANALYZE);
      return;
    }

    if (job.name === CONTENT_AUTOMATION_JOB.GENERATE_OUTLINE) {
      await this.processAiJob(job, aiRunId, AiTaskType.OUTLINE);
      return;
    }

    if (job.name === CONTENT_AUTOMATION_JOB.GENERATE_ARTICLE) {
      await this.processAiJob(job, aiRunId, AiTaskType.WRITE);
      return;
    }

    this.logger.warn(`Unhandled content automation job: ${job.name}`);
    if (aiRunId) {
      await this.aiRunRepository.completeRun(aiRunId, {
        status: AiRunStatus.FAILED,
        error: `Job ${job.name} not implemented`,
      });
    }
  }

  private async processAiJob(
    job: Job<ContentAutomationJobPayload>,
    aiRunId: string | undefined,
    task: AiTaskType,
  ): Promise<void> {
    const planId = job.data.planId;

    if (aiRunId) {
      const run = await this.aiRunRepository.findById(aiRunId);
      if (run?.status === AiRunStatus.SUCCEEDED || run?.status === AiRunStatus.CANCELLED) {
        return;
      }
      await this.aiRunRepository.completeRun(aiRunId, { status: AiRunStatus.RUNNING });
    }

    const timeoutMs = this.resolveJobTimeoutMs();

    try {
      const result = await withTimeout(
        this.orchestrator.execute({
          planId,
          task,
          generationEpoch: job.data.generationEpoch,
          aiRunId,
        }),
        timeoutMs,
        () =>
          new AiProviderError(
            `Content automation soft timeout after ${timeoutMs}ms`,
            'TIMEOUT',
            true,
          ),
      );

      if (result.noop) {
        this.logger.log(`${task} noop plan=${planId} reason=${result.reason ?? 'unknown'}`);
        return;
      }

      this.logger.log(
        `${task} completed plan=${planId} source=${result.source} transitioned=${result.transitioned}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analyze failed';
      this.audit.log('plan.ai.failed', { planId, task, error: message });
      if (aiRunId) {
        const run = await this.aiRunRepository.findById(aiRunId);
        if (run && run.status !== AiRunStatus.FAILED && run.status !== AiRunStatus.CANCELLED) {
          await this.aiRunRepository.completeRun(aiRunId, {
            status: AiRunStatus.FAILED,
            error: message.slice(0, 500),
          });
        }
      }
      if (isAnalyzeJobRetryable(err)) {
        throw err;
      }
      this.logger.warn(
        `AI job non-retryable failure plan=${planId} task=${task} — job will not retry`,
      );
    }
  }

  private resolveJobTimeoutMs(): number {
    const raw = process.env.CONTENT_AUTOMATION_JOB_TIMEOUT_MS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : CONTENT_AUTOMATION_JOB_TIMEOUT_MS;
  }
}

export const contentAutomationWorkerProviders = shouldRegisterWorkers()
  ? [ContentAutomationWorker]
  : [];
