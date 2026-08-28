import { Injectable } from '@nestjs/common';
import { AiPromptTemplate } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AiPromptRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByKey(key: string): Promise<AiPromptTemplate | null> {
    return this.prisma.aiPromptTemplate.findFirst({
      where: { key, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  listActive(): Promise<AiPromptTemplate[]> {
    return this.prisma.aiPromptTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
    });
  }
}
