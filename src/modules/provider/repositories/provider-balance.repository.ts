import { Injectable } from '@nestjs/common';
import { ProviderBalanceStatus, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class ProviderBalanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProviderId(providerId: string) {
    return this.prisma.providerBalance.findUnique({
      where: { providerId },
    });
  }

  async ensureForProvider(providerId: string, threshold = 5_000_000) {
    const existing = await this.findByProviderId(providerId);
    if (existing) {
      return existing;
    }

    return this.prisma.providerBalance.create({
      data: {
        providerId,
        lowBalanceThreshold: new Decimal(threshold),
      },
    });
  }

  updateSyncResult(params: {
    providerId: string;
    balance: Decimal;
    status: ProviderBalanceStatus;
    lastSyncAt: Date;
    lastErrorMessage?: string | null;
    lastErrorAt?: Date | null;
  }) {
    return this.prisma.providerBalance.update({
      where: { providerId: params.providerId },
      data: {
        balance: params.balance,
        status: params.status,
        lastSyncAt: params.lastSyncAt,
        lastErrorMessage: params.lastErrorMessage ?? null,
        lastErrorAt: params.lastErrorAt ?? null,
      },
    });
  }

  updateAlertSettings(params: {
    providerId: string;
    lowBalanceThreshold?: Decimal;
    alertAdminEnabled?: boolean;
    alertTelegramEnabled?: boolean;
    alertEmailEnabled?: boolean;
  }) {
    return this.prisma.providerBalance.update({
      where: { providerId: params.providerId },
      data: {
        lowBalanceThreshold: params.lowBalanceThreshold,
        alertAdminEnabled: params.alertAdminEnabled,
        alertTelegramEnabled: params.alertTelegramEnabled,
        alertEmailEnabled: params.alertEmailEnabled,
      },
    });
  }

  listAll() {
    return this.prisma.providerBalance.findMany({
      include: { provider: { select: { id: true, code: true, name: true, status: true, deletedAt: true } } },
    });
  }
}
