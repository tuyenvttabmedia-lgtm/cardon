import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiRunStatus, AiTaskType } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  CONTENT_AUTOMATION_JOB,
  CONTENT_AUTOMATION_QUEUE,
  CONTENT_AUTOMATION_QUEUE_OPTIONS,
  CONTENT_AUTOMATION_RATE_LIMIT_PER_HOUR,
} from '../entities/content-automation.constants';
import { ContentAutomationQueueJobData } from '../entities/content-automation.types';
import { buildBullMqJobId } from '../entities/idempotency.util';
import { AiRunRepository } from '../repositories/ai-run.repository';
import { ContentAutomationConfigService } from '../services/content-automation-config.service';

@Injectable()
export class ContentAutomationQueueProducer {
  constructor(
    @InjectQueue(CONTENT_AUTOMATION_QUEUE) private readonly queue: Queue,
    private readonly config: ContentAutomationConfigService,
    private readonly aiRunRepository: AiRunRepository,
  ) {}

  async enqueuePing(planId: string, generationEpoch: number): Promise<{ jobId: string; aiRunId: string }> {
    return this.enqueue({
      planId,
      task: AiTaskType.ANALYZE,
      generationEpoch,
      jobName: CONTENT_AUTOMATION_JOB.PING,
    });
  }

  async enqueueAnalyze(
    planId: string,
    generationEpoch: number,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    return this.enqueue({
      planId,
      task: AiTaskType.ANALYZE,
      generationEpoch,
      jobName: CONTENT_AUTOMATION_JOB.ANALYZE,
    });
  }

  async enqueueOutline(
    planId: string,
    generationEpoch: number,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    return this.enqueue({
      planId,
      task: AiTaskType.OUTLINE,
      generationEpoch,
      jobName: CONTENT_AUTOMATION_JOB.GENERATE_OUTLINE,
    });
  }

  async enqueueWrite(
    planId: string,
    generationEpoch: number,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    return this.enqueue({
      planId,
      task: AiTaskType.WRITE,
      generationEpoch,
      jobName: CONTENT_AUTOMATION_JOB.GENERATE_ARTICLE,
    });
  }

  async enqueue(
    data: ContentAutomationQueueJobData,
  ): Promise<{ jobId: string; aiRunId: string; reused?: boolean }> {
    if (!this.config.isEnabled()) {
      throw new ServiceUnavailableException('Content Automation is disabled');
    }

    const active = await this.aiRunRepository.findActiveByIdempotency(
      data.planId,
      data.task,
      data.generationEpoch,
    );
    if (active) {
      throw new ConflictException({
        error: 'JOB_ALREADY_ACTIVE',
        aiRunId: active.id,
      });
    }

    const succeeded = await this.aiRunRepository.findLatestByIdempotency(
      data.planId,
      data.task,
      data.generationEpoch,
    );
    if (succeeded?.status === AiRunStatus.SUCCEEDED) {
      return {
        jobId: buildBullMqJobId(data.planId, data.task, data.generationEpoch),
        aiRunId: succeeded.id,
        reused: true,
      };
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.aiRunRepository.countRecentForPlan(data.planId, since);
    if (recentCount >= CONTENT_AUTOMATION_RATE_LIMIT_PER_HOUR) {
      throw new HttpException(
        {
          error: 'RATE_LIMIT_EXCEEDED',
          message: `Max ${CONTENT_AUTOMATION_RATE_LIMIT_PER_HOUR} AI jobs per plan per hour`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const aiRun = await this.aiRunRepository.create({
      contentPlan: { connect: { id: data.planId } },
      task: data.task,
      generationEpoch: data.generationEpoch,
      status: AiRunStatus.QUEUED,
    });

    const jobId = buildBullMqJobId(data.planId, data.task, data.generationEpoch);
    await this.removeTerminalJobIfExists(jobId);

    try {
      await this.queue.add(data.jobName, { ...data, aiRunId: aiRun.id }, {
        jobId,
        ...CONTENT_AUTOMATION_QUEUE_OPTIONS,
      });
    } catch (err) {
      await this.aiRunRepository.completeRun(aiRun.id, {
        status: AiRunStatus.FAILED,
        error: err instanceof Error ? err.message.slice(0, 500) : 'Queue enqueue failed',
      });
      throw err;
    }

    return { jobId, aiRunId: aiRun.id };
  }

  /** Allow re-enqueue after FAILED/COMPLETED by clearing leftover BullMQ job with same id. */
  private async removeTerminalJobIfExists(jobId: string): Promise<void> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) return;
    const state = await existing.getState();
    if (state === 'failed' || state === 'completed') {
      await existing.remove();
    }
  }
}
