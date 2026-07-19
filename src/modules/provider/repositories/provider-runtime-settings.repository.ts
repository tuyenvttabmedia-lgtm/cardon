import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProviderRuntimeSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProviderId(providerId: string) {
    return this.prisma.providerRuntimeSetting.findUnique({
      where: { providerId },
    });
  }

  upsert(
    providerId: string,
    data: {
      maintenanceMode: boolean;
      reason?: string | null;
      startAt?: Date | null;
      endAt?: Date | null;
    },
  ) {
    return this.prisma.providerRuntimeSetting.upsert({
      where: { providerId },
      create: {
        providerId,
        maintenanceMode: data.maintenanceMode,
        reason: data.reason ?? null,
        startAt: data.startAt ?? null,
        endAt: data.endAt ?? null,
      },
      update: {
        maintenanceMode: data.maintenanceMode,
        reason: data.reason ?? null,
        startAt: data.startAt ?? null,
        endAt: data.endAt ?? null,
      },
    });
  }

  isProviderInMaintenance(providerId: string, at = new Date()): Promise<boolean> {
    return this.findByProviderId(providerId).then((row) => {
      if (!row?.maintenanceMode) return false;
      if (row.startAt && at < row.startAt) return false;
      if (row.endAt && at > row.endAt) return false;
      return true;
    });
  }

  listActiveMaintenanceProviderIds(at = new Date()) {
    return this.prisma.providerRuntimeSetting.findMany({
      where: {
        maintenanceMode: true,
        OR: [
          { startAt: null },
          { startAt: { lte: at } },
        ],
        AND: [
          {
            OR: [{ endAt: null }, { endAt: { gte: at } }],
          },
        ],
      },
      select: { providerId: true },
    });
  }
}
