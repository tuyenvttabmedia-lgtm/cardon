import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  findByKey(key: string) {
    return this.prisma.systemSetting.findUnique({ where: { key } });
  }

  upsert(key: string, value: Prisma.InputJsonValue, description?: string) {
    return this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value, description },
      update: { value, description },
    });
  }
}
