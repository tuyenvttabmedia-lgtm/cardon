import { Injectable } from '@nestjs/common';
import {
  NotificationRecipientRole,
  NotificationRecipientType,
  ProviderOperationalStatus,
  ProviderStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PrismaService } from '../../../database/prisma.service';

const HEALTH_SAMPLE = 100;
const SLOW_LATENCY_MS = 800;
const ERROR_RATE_THRESHOLD = 50;

@Injectable()
export class ProviderHealthMonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async recordApiCall(params: {
    providerId: string;
    success: boolean;
    latencyMs: number;
    errorMessage?: string;
  }) {
    const recent = await this.prisma.providerTransaction.findMany({
      where: { providerId: params.providerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: HEALTH_SAMPLE,
      select: { status: true, createdAt: true },
    });

    const sampleSize = recent.length || 1;
    const successCount = recent.filter(
      (row) => row.status === ProviderTransactionStatus.SUCCESS,
    ).length;
    const failedCount = recent.filter(
      (row) =>
        row.status === ProviderTransactionStatus.FAILED ||
        row.status === ProviderTransactionStatus.TIMEOUT,
    ).length;

    const successRate = new Decimal((successCount / sampleSize) * 100);
    const errorRate = new Decimal((failedCount / sampleSize) * 100);

    const existing = await this.prisma.providerHealthMetric.findUnique({
      where: { providerId: params.providerId },
    });

    const prevLatency = existing?.avgLatencyMs ?? params.latencyMs;
    const avgLatencyMs = Math.round(prevLatency * 0.7 + params.latencyMs * 0.3);

    let operationalStatus: ProviderOperationalStatus = ProviderOperationalStatus.ONLINE;
    if (Number(errorRate) >= ERROR_RATE_THRESHOLD) {
      operationalStatus = ProviderOperationalStatus.ERROR;
    } else if (avgLatencyMs >= SLOW_LATENCY_MS) {
      operationalStatus = ProviderOperationalStatus.SLOW;
    }

    return this.prisma.providerHealthMetric.upsert({
      where: { providerId: params.providerId },
      create: {
        providerId: params.providerId,
        successRate,
        errorRate,
        avgLatencyMs,
        sampleSize,
        operationalStatus,
        lastErrorMessage: params.success ? null : params.errorMessage,
        lastErrorAt: params.success ? null : new Date(),
      },
      update: {
        successRate,
        errorRate,
        avgLatencyMs,
        sampleSize,
        operationalStatus,
        ...(params.success
          ? {}
          : {
              lastErrorMessage: params.errorMessage,
              lastErrorAt: new Date(),
            }),
      },
    });
  }

  getMetric(providerId: string) {
    return this.prisma.providerHealthMetric.findUnique({
      where: { providerId },
    });
  }

  listAllMetrics() {
    return this.prisma.providerHealthMetric.findMany({
      include: {
        provider: { select: { id: true, code: true, name: true, status: true } },
      },
    });
  }
}

@Injectable()
export class ProviderAutoProtectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthMonitor: ProviderHealthMonitorService,
  ) {}

  async evaluateProvider(providerId: string): Promise<boolean> {
    const metric = await this.healthMonitor.getMetric(providerId);
    if (!metric) return false;

    const recent = await this.prisma.providerTransaction.findMany({
      where: { providerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { status: true },
    });

    if (recent.length < 20) return false;

    const allFailed = recent.every(
      (row) =>
        row.status === ProviderTransactionStatus.FAILED ||
        row.status === ProviderTransactionStatus.TIMEOUT,
    );

    const errorRate = Number(metric.errorRate);
    if (!allFailed || errorRate <= ERROR_RATE_THRESHOLD) {
      return false;
    }

    await this.prisma.provider.update({
      where: { id: providerId },
      data: { status: ProviderStatus.DEGRADED },
    });

    await this.prisma.notification.create({
      data: {
        recipientType: NotificationRecipientType.ADMIN_ROLE,
        recipientRole: NotificationRecipientRole.ADMIN,
        type: 'PROVIDER_DEGRADED',
        title: 'NCC tạm dừng tự động',
        body: 'Esale đang lỗi, hệ thống đã tạm dừng routing tới NCC này.',
        metadata: { providerId, errorRate },
      },
    });

    return true;
  }
}
