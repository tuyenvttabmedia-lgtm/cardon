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
