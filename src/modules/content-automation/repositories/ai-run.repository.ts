import { Injectable } from '@nestjs/common';
import { AiRun, AiRunStatus, AiTaskType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface CompleteAiRunInput {
  status: AiRunStatus;
  provider?: string;
  model?: string;
  promptVersion?: string;
  inputHash?: string;
  contextRefs?: Prisma.InputJsonValue;
  outputSnapshot?: Prisma.InputJsonValue;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: string | number | null;
  durationMs?: number;
  error?: string;
  finishedAt?: Date;
}

@Injectable()
export class AiRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AiRunCreateInput): Promise<AiRun> {
    return this.prisma.aiRun.create({ data });
  }

  findById(id: string): Promise<AiRun | null> {
    return this.prisma.aiRun.findUnique({ where: { id } });
  }

  findLatestByIdempotency(
    contentPlanId: string,
    task: AiTaskType,
    generationEpoch: number,
  ): Promise<AiRun | null> {
    return this.prisma.aiRun.findFirst({
      where: { contentPlanId, task, generationEpoch },
      orderBy: { createdAt: 'desc' },
    });
  }

  findActiveByIdempotency(
    contentPlanId: string,
    task: AiTaskType,
    generationEpoch: number,
  ): Promise<AiRun | null> {
    return this.prisma.aiRun.findFirst({
      where: {
        contentPlanId,
        task,
        generationEpoch,
        status: { in: [AiRunStatus.QUEUED, AiRunStatus.RUNNING] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  listByPlan(contentPlanId: string, take = 50): Promise<AiRun[]> {
    return this.prisma.aiRun.findMany({
      where: { contentPlanId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  countRecentForPlan(contentPlanId: string, since: Date): Promise<number> {
    return this.prisma.aiRun.count({
      where: {
        contentPlanId,
        createdAt: { gte: since },
        status: { not: AiRunStatus.CANCELLED },
      },
    });
  }

  updateStatus(
    id: string,
    data: Pick<Prisma.AiRunUpdateInput, 'status' | 'error' | 'finishedAt' | 'outputSnapshot'>,
  ): Promise<AiRun> {
    return this.prisma.aiRun.update({ where: { id }, data });
  }

  /**
   * CAS-style complete: terminal statuses only apply while still QUEUED/RUNNING.
   * Prevents late SUCCEEDED from overwriting FAILED/CANCELLED (soft-timeout race).
   * Returns the row after attempt (may be unchanged if already terminal).
   */
  async completeRun(id: string, data: CompleteAiRunInput): Promise<AiRun | null> {
    const terminal =
      data.status === AiRunStatus.SUCCEEDED ||
      data.status === AiRunStatus.FAILED ||
      data.status === AiRunStatus.CANCELLED;

    const patch: Prisma.AiRunUpdateManyMutationInput = {
      status: data.status,
      ...(data.provider !== undefined ? { provider: data.provider } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(data.promptVersion !== undefined ? { promptVersion: data.promptVersion } : {}),
      ...(data.inputHash !== undefined ? { inputHash: data.inputHash } : {}),
      ...(data.contextRefs !== undefined ? { contextRefs: data.contextRefs } : {}),
      ...(data.outputSnapshot !== undefined ? { outputSnapshot: data.outputSnapshot } : {}),
      ...(data.tokensIn !== undefined ? { tokensIn: data.tokensIn } : {}),
      ...(data.tokensOut !== undefined ? { tokensOut: data.tokensOut } : {}),
      ...(data.costUsd !== undefined ? { costUsd: data.costUsd } : {}),
      ...(data.durationMs !== undefined ? { durationMs: data.durationMs } : {}),
      ...(data.error !== undefined ? { error: data.error } : {}),
      ...(terminal
        ? { finishedAt: data.finishedAt ?? new Date() }
        : data.finishedAt
          ? { finishedAt: data.finishedAt }
          : {}),
    };

    if (terminal) {
      const result = await this.prisma.aiRun.updateMany({
        where: {
          id,
          status: { in: [AiRunStatus.QUEUED, AiRunStatus.RUNNING] },
        },
        data: patch,
      });
      if (result.count !== 1) {
        return this.findById(id);
      }
      return this.findById(id);
    }

    // Non-terminal (e.g. RUNNING): only from QUEUED/RUNNING.
    const result = await this.prisma.aiRun.updateMany({
      where: {
        id,
        status: { in: [AiRunStatus.QUEUED, AiRunStatus.RUNNING] },
      },
      data: patch,
    });
    if (result.count !== 1) {
      return this.findById(id);
    }
    return this.findById(id);
  }
}
