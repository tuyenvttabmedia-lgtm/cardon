import { Processor, WorkerHost } from '@nestjs/bullmq';

import { Logger } from '@nestjs/common';

import { AiRunStatus, AiTaskType } from '@prisma/client';

import { Job } from 'bullmq';

import { shouldRegisterWorkers } from '../../../config/process-role';

import {

  CONTENT_AUTOMATION_JOB,

  CONTENT_AUTOMATION_QUEUE,

} from '../entities/content-automation.constants';

import { ContentAutomationQueueJobData } from '../entities/content-automation.types';

import { AiOrchestratorService } from '../orchestrators/ai-orchestrator.service';

import { AiRunRepository } from '../repositories/ai-run.repository';

import { ContentAutomationConfigService } from '../services/content-automation-config.service';

import { ContentAutomationAuditService } from '../services/content-automation-audit.service';
import { isAnalyzeJobRetryable } from '../utils/analyze-error.util';



type ContentAutomationJobPayload = ContentAutomationQueueJobData & {

  aiRunId?: string;

};



@Processor(CONTENT_AUTOMATION_QUEUE, { concurrency: 1 })

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

    if (!this.config.isEnabled()) {

      this.logger.warn('Content Automation worker received job while feature disabled — skipping');

      return;

    }



    const aiRunId = job.data.aiRunId;

    if (aiRunId) {

      const run = await this.aiRunRepository.findById(aiRunId);

      if (run?.status === AiRunStatus.SUCCEEDED) {

        this.logger.log(`Skipping already succeeded run ${aiRunId}`);

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



    this.logger.warn(`Unhandled content automation job in M3 CORE: ${job.name}`);

    if (aiRunId) {

      await this.aiRunRepository.completeRun(aiRunId, {

        status: AiRunStatus.FAILED,

        error: `Job ${job.name} not implemented in M3 CORE`,

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

      if (run?.status === AiRunStatus.SUCCEEDED) {

        return;

      }

      await this.aiRunRepository.completeRun(aiRunId, { status: AiRunStatus.RUNNING });

    }



    try {

      const result = await this.orchestrator.execute({

        planId,

        task,

        generationEpoch: job.data.generationEpoch,

        aiRunId,

      });



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

        if (run && run.status !== AiRunStatus.FAILED) {

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

}



export const contentAutomationWorkerProviders = shouldRegisterWorkers()

  ? [ContentAutomationWorker]

  : [];


