import { Injectable, Logger } from '@nestjs/common';
import { AiRunStatus, AiTaskType, ContentPlanStatus } from '@prisma/client';
import { ContentPlanRepository } from '../repositories/content-plan.repository';
import { AiRunRepository } from '../repositories/ai-run.repository';

export interface WorkerGuardInput {
  planId: string;
  task: AiTaskType;
  generationEpoch: number;
  aiRunId?: string;
}

export interface WorkerGuardResult {
  noop: boolean;
  reason?: string;
}

@Injectable()
export class AiWorkerGuardService {
  private readonly logger = new Logger(AiWorkerGuardService.name);

  constructor(
    private readonly planRepository: ContentPlanRepository,
    private readonly aiRunRepository: AiRunRepository,
  ) {}

  async assertRunnable(input: WorkerGuardInput): Promise<WorkerGuardResult> {
    const plan = await this.planRepository.findById(input.planId);
    if (!plan) {
      throw new Error('Content plan not found');
    }

    if (plan.generationEpoch !== input.generationEpoch) {
      await this.cancelRun(input.aiRunId, 'STALE_GENERATION_EPOCH');
      this.logger.warn(
        `Stale job plan=${input.planId} jobEpoch=${input.generationEpoch} planEpoch=${plan.generationEpoch}`,
      );
      return { noop: true, reason: 'STALE_GENERATION_EPOCH' };
    }

    if (input.task === AiTaskType.ANALYZE && plan.status !== ContentPlanStatus.DRAFT) {
      await this.cancelRun(input.aiRunId, 'PLAN_STATUS_INCOMPATIBLE');
      this.logger.warn(
        `Analyze skipped — plan ${input.planId} status=${plan.status} (expected DRAFT)`,
      );
      return { noop: true, reason: 'PLAN_STATUS_INCOMPATIBLE' };
    }

    if (input.task === AiTaskType.OUTLINE && plan.status !== ContentPlanStatus.PLANNED) {
      await this.cancelRun(input.aiRunId, 'PLAN_STATUS_INCOMPATIBLE');
      return { noop: true, reason: 'PLAN_STATUS_INCOMPATIBLE' };
    }

    if (input.task === AiTaskType.WRITE && plan.status !== ContentPlanStatus.OUTLINE_APPROVED) {
      await this.cancelRun(input.aiRunId, 'PLAN_STATUS_INCOMPATIBLE');
      return { noop: true, reason: 'PLAN_STATUS_INCOMPATIBLE' };
    }

    return { noop: false };
  }

  private async cancelRun(aiRunId: string | undefined, reason: string): Promise<void> {
    if (!aiRunId) return;
    await this.aiRunRepository.completeRun(aiRunId, {
      status: AiRunStatus.CANCELLED,
      error: reason,
      finishedAt: new Date(),
    });
  }
}
