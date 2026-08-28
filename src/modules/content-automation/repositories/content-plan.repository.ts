import { Injectable } from '@nestjs/common';
import {
  ContentPlan,
  ContentPlanContentType,
  ContentPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

export interface ListContentPlansParams {
  status?: ContentPlanStatus;
  contentType?: ContentPlanContentType;
  q?: string;
  skip: number;
  take: number;
}

@Injectable()
export class ContentPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ContentPlan | null> {
    return this.prisma.contentPlan.findUnique({ where: { id } });
  }

  create(data: Prisma.ContentPlanCreateInput): Promise<ContentPlan> {
    return this.prisma.contentPlan.create({ data });
  }

  update(id: string, data: Prisma.ContentPlanUpdateInput): Promise<ContentPlan> {
    return this.prisma.contentPlan.update({ where: { id }, data });
  }

  /**
   * Persist only when generation_epoch still matches the job epoch (spec §15).
   * Returns null when the plan was bumped (stale job) or missing.
   */
  async updateIfGenerationEpoch(
    id: string,
    generationEpoch: number,
    data: Prisma.ContentPlanUpdateInput,
  ): Promise<ContentPlan | null> {
    const result = await this.prisma.contentPlan.updateMany({
      where: { id, generationEpoch },
      data: data as Prisma.ContentPlanUpdateManyMutationInput,
    });
    if (result.count !== 1) return null;
    return this.findById(id);
  }

  /**
   * APPROVED plans that already have a CMS link — used by publish sync (paginated).
   */
  listApprovedWithCmsPage(params: {
    skip: number;
    take: number;
  }): Promise<ContentPlan[]> {
    return this.prisma.contentPlan.findMany({
      where: {
        status: ContentPlanStatus.APPROVED,
        cmsPageId: { not: null },
      },
      orderBy: { updatedAt: 'asc' },
      skip: params.skip,
      take: params.take,
    });
  }

  /**
   * Row-lock plan for critical writes (CMS draft). Caller must use the same tx client.
   */
  async findByIdForUpdate(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<ContentPlan | null> {
    await tx.$executeRaw`SELECT 1 FROM content_plans WHERE id = ${id}::uuid FOR UPDATE`;
    return tx.contentPlan.findUnique({ where: { id } });
  }

  updateWithClient(
    tx: Prisma.TransactionClient,
    id: string,
    data: Prisma.ContentPlanUpdateInput,
  ): Promise<ContentPlan> {
    return tx.contentPlan.update({ where: { id }, data });
  }

  transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  async list(params: ListContentPlansParams): Promise<{ items: ContentPlan[]; total: number }> {
    const where: Prisma.ContentPlanWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.contentType ? { contentType: params.contentType } : {}),
      ...(params.q
        ? {
            OR: [
              { topic: { contains: params.q, mode: 'insensitive' } },
              { primaryKeyword: { contains: params.q, mode: 'insensitive' } },
              { suggestedTitle: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentPlan.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.contentPlan.count({ where }),
    ]);

    return { items, total };
  }

  incrementGenerationEpoch(id: string, expectedEpoch: number): Promise<ContentPlan | null> {
    return this.prisma.contentPlan
      .updateMany({
        where: { id, generationEpoch: expectedEpoch },
        data: { generationEpoch: { increment: 1 } },
      })
      .then((result) => (result.count === 1 ? this.findById(id) : null));
  }
}
