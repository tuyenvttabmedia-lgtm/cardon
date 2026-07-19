import { Injectable, NotFoundException } from '@nestjs/common';

import {

  ProviderBalanceStatus,

  ProviderOperationalStatus,

  ProviderStatus,

  ProviderProductAvailability,

  ProviderTransactionStatus,

} from '@prisma/client';

import { Decimal } from '@prisma/client/runtime/library';

import { DEFAULT_LOW_BALANCE_THRESHOLD } from '../../provider/entities/provider.constants';

import {

  ProviderRepository,

  ProviderTransactionRepository,

} from '../../provider/repositories/provider.repository';

import { ProviderHealthService } from '../../provider/services/provider-health.service';

import { ProviderHealthMonitorService } from '../../provider/services/provider-health-monitor.service';

import { ProviderRegistryService } from '../../provider/services/provider-registry.service';

import { ProviderRuntimeSettingsRepository } from '../../provider/repositories/provider-runtime-settings.repository';

import { ProviderBalanceRepository } from '../../provider/repositories/provider-balance.repository';

import { ProviderMappingRepository } from '../../product/repositories/provider-mapping.repository';

import { AdminProviderTransactionQueryDto } from '../dto/admin.dto';

import { mapAdminProviderTransaction } from '../entities/admin-provider-transaction.mapper';

import { AdminRepository } from '../repositories/admin.repository';



@Injectable()

export class AdminProviderService {

  constructor(

    private readonly repository: AdminRepository,

    private readonly providerRepository: ProviderRepository,

    private readonly providerHealthService: ProviderHealthService,

    private readonly healthMonitor: ProviderHealthMonitorService,

    private readonly providerRegistry: ProviderRegistryService,

    private readonly providerTransactionRepository: ProviderTransactionRepository,

    private readonly runtimeSettingsRepository: ProviderRuntimeSettingsRepository,

    private readonly balanceRepository: ProviderBalanceRepository,

    private readonly mappingRepository: ProviderMappingRepository,

  ) {}



  async getProvidersStatus() {

    const providers = await this.repository.listProviderStatus();



    return Promise.all(

      providers.map(async (provider) => {

        const recentFailures = await this.repository.findRecentProviderFailures(

          provider.id,

        );

        const balanceRow = await this.repository.findProviderBalance(provider.id);

        const metric = await this.healthMonitor.getMetric(provider.id);

        const threshold = balanceRow

          ? Number(balanceRow.lowBalanceThreshold)

          : DEFAULT_LOW_BALANCE_THRESHOLD;

        const balance = balanceRow

          ? Number(balanceRow.balance)

          : Number(provider.balance);



        const [successToday, failedToday, totalToday] = await Promise.all([

          this.repository.countProviderTransactionsToday(

            provider.id,

            ProviderTransactionStatus.SUCCESS,

          ),

          this.repository.countProviderTransactionsToday(

            provider.id,

            ProviderTransactionStatus.FAILED,

          ),

          this.repository.countProviderTransactionsToday(provider.id),

        ]);



        const successRate =

          metric != null

            ? Number(metric.successRate)

            : totalToday > 0

              ? Math.round((successToday / totalToday) * 1000) / 10

              : null;



        const healthStatus = this.resolveHealthStatus(provider.status, metric, balanceRow?.status);



        const lastError = metric?.lastErrorMessage

          ? {

              message: metric.lastErrorMessage,

              at: metric.lastErrorAt?.toISOString() ?? new Date().toISOString(),

            }

          : recentFailures.find((f) => f.errorMessage)

            ? {

                message: recentFailures.find((f) => f.errorMessage)!.errorMessage,

                at: recentFailures.find((f) => f.errorMessage)!.createdAt.toISOString(),

              }

            : null;



        return {

          id: provider.id,

          code: provider.code,

          name: provider.name,

          status: provider.status,

          healthStatus,

          balance: balance.toFixed(2),

          balanceStatus: balanceRow?.status ?? ProviderBalanceStatus.NORMAL,

          lastCheckedAt:

            balanceRow?.lastSyncAt?.toISOString() ??

            provider.lastBalanceSyncedAt?.toISOString() ??

            null,

          lowBalanceWarning:

            balanceRow?.status === ProviderBalanceStatus.LOW_BALANCE ||

            balance < threshold,

          threshold,

          todaySuccess: successToday,

          todayFailed: failedToday,

          successRate,

          avgLatencyMs: metric?.avgLatencyMs ?? null,

          errorRate: metric != null ? Number(metric.errorRate) : null,

          lastError,

          recentFailures,

        };

      }),

    );

  }



  private resolveHealthStatus(

    providerStatus: ProviderStatus,

    metric: { operationalStatus: ProviderOperationalStatus } | null,

    balanceStatus?: ProviderBalanceStatus,

  ): 'ONLINE' | 'OFFLINE' | 'ERROR' | 'SLOW' {

    if (providerStatus === ProviderStatus.DEGRADED) {

      return 'ERROR';

    }

    if (providerStatus !== ProviderStatus.ACTIVE) {

      return 'OFFLINE';

    }

    if (balanceStatus === ProviderBalanceStatus.ERROR) {

      return 'ERROR';

    }

    if (metric?.operationalStatus === ProviderOperationalStatus.ERROR) {

      return 'ERROR';

    }

    if (metric?.operationalStatus === ProviderOperationalStatus.SLOW) {

      return 'SLOW';

    }

    return 'ONLINE';

  }



  async listTransactions(providerId: string, query: AdminProviderTransactionQueryDto) {

    await this.requireProvider(providerId);



    const [rows, total] = await Promise.all([

      this.providerTransactionRepository.findManyByProviderAdmin(providerId, {

        skip: query.skip,

        take: query.take,

      }),

      this.providerTransactionRepository.countByProviderAdmin(providerId),

    ]);



    return {

      items: rows.map(mapAdminProviderTransaction),

      total,

    };

  }



  async checkBalance(providerId: string) {

    await this.requireProvider(providerId);

    const result = await this.providerHealthService.syncProviderBalance(providerId);

    return {

      balance: result.balance.toFixed(2),

      lastCheckedAt: result.lastCheckedAt.toISOString(),

      lowBalance: result.lowBalance,

      status: result.status,

    };

  }



  async syncProducts(providerId: string) {

    const provider = await this.requireProvider(providerId);

    const adapter = this.providerRegistry.getAdapter(provider.code);

    const result = await adapter.syncProducts();

    return result;

  }



  async getProviderDetail(providerId: string) {

    const provider = await this.requireProvider(providerId);

    const [balanceRow, metric, runtimeSetting] = await Promise.all([

      this.repository.findProviderBalance(provider.id),

      this.healthMonitor.getMetric(provider.id),

      this.runtimeSettingsRepository.findByProviderId(provider.id),

    ]);



    return {

      id: provider.id,

      code: provider.code,

      name: provider.name,

      status: provider.status,

      balance: balanceRow?.balance.toFixed(2) ?? provider.balance.toFixed(2),

      lastCheckedAt:

        balanceRow?.lastSyncAt?.toISOString() ??

        provider.lastBalanceSyncedAt?.toISOString() ??

        null,

      successRate: metric != null ? Number(metric.successRate) : null,

      avgLatencyMs: metric?.avgLatencyMs ?? null,

      lastError: metric?.lastErrorMessage ?? null,

      runtimeSetting: runtimeSetting

        ? {

            maintenanceMode: runtimeSetting.maintenanceMode,

            reason: runtimeSetting.reason,

            startAt: runtimeSetting.startAt?.toISOString() ?? null,

            endAt: runtimeSetting.endAt?.toISOString() ?? null,

          }

        : {

            maintenanceMode: false,

            reason: null,

            startAt: null,

            endAt: null,

          },

    };

  }



  async testConnection(providerId: string) {

    const provider = await this.requireProvider(providerId);

    const adapter = this.providerRegistry.getAdapter(provider.code);

    const startedAt = Date.now();



    try {

      const result = await adapter.getBalance();

      return {

        success: true,

        balance: result.balance.toFixed(2),

        currency: result.currency ?? 'VND',

        responseTimeMs: Date.now() - startedAt,

        message: 'API Connected',

      };

    } catch (error) {

      return {

        success: false,

        errorCode: 'CONNECTION_FAILED',

        message: error instanceof Error ? error.message : String(error),

        responseTimeMs: Date.now() - startedAt,

      };

    }

  }



  async getRuntimeSettings(providerId: string) {

    await this.requireProvider(providerId);

    const row = await this.runtimeSettingsRepository.findByProviderId(providerId);

    return {

      maintenanceMode: row?.maintenanceMode ?? false,

      reason: row?.reason ?? null,

      startAt: row?.startAt?.toISOString() ?? null,

      endAt: row?.endAt?.toISOString() ?? null,

    };

  }



  async updateRuntimeSettings(

    providerId: string,

    data: {

      maintenanceMode: boolean;

      reason?: string | null;

      startAt?: string | null;

      endAt?: string | null;

    },

  ) {

    await this.requireProvider(providerId);

    const row = await this.runtimeSettingsRepository.upsert(providerId, {

      maintenanceMode: data.maintenanceMode,

      reason: data.reason ?? null,

      startAt: data.startAt ? new Date(data.startAt) : null,

      endAt: data.endAt ? new Date(data.endAt) : null,

    });



    await this.mappingRepository.markProviderAvailability(

      providerId,

      data.maintenanceMode
        ? ProviderProductAvailability.MAINTENANCE
        : ProviderProductAvailability.AVAILABLE,

    );



    return {

      maintenanceMode: row.maintenanceMode,

      reason: row.reason,

      startAt: row.startAt?.toISOString() ?? null,

      endAt: row.endAt?.toISOString() ?? null,

    };

  }



  async getAlertSettings(providerId: string) {
    await this.requireProvider(providerId);
    const row = await this.balanceRepository.ensureForProvider(providerId);
    return {
      lowBalanceThreshold: Number(row.lowBalanceThreshold),
      alertAdminEnabled: row.alertAdminEnabled,
      alertTelegramEnabled: row.alertTelegramEnabled,
      alertEmailEnabled: row.alertEmailEnabled,
    };
  }

  async updateAlertSettings(
    providerId: string,
    data: {
      lowBalanceThreshold?: number;
      alertAdminEnabled?: boolean;
      alertTelegramEnabled?: boolean;
      alertEmailEnabled?: boolean;
    },
  ) {
    await this.requireProvider(providerId);
    await this.balanceRepository.ensureForProvider(providerId);
    const row = await this.balanceRepository.updateAlertSettings({
      providerId,
      lowBalanceThreshold:
        data.lowBalanceThreshold !== undefined
          ? new Decimal(data.lowBalanceThreshold)
          : undefined,
      alertAdminEnabled: data.alertAdminEnabled,
      alertTelegramEnabled: data.alertTelegramEnabled,
      alertEmailEnabled: data.alertEmailEnabled,
    });
    return {
      lowBalanceThreshold: Number(row.lowBalanceThreshold),
      alertAdminEnabled: row.alertAdminEnabled,
      alertTelegramEnabled: row.alertTelegramEnabled,
      alertEmailEnabled: row.alertEmailEnabled,
    };
  }



  private async requireProvider(providerId: string) {

    const provider = await this.providerRepository.findProviderById(providerId);

    if (!provider) {

      throw new NotFoundException('Provider not found');

    }

    return provider;

  }

}


