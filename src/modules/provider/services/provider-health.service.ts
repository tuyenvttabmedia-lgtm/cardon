import { Injectable, Logger } from '@nestjs/common';

import { ProviderBalanceStatus, SystemActivityEventCategory, SystemActivityEventType, SystemActivitySeverity, SystemActivitySource } from '@prisma/client';

import { Decimal } from '@prisma/client/runtime/library';

import { ConfigService } from '@nestjs/config';

import { ActivityEventDispatcher } from '../../activity-event/activity-event-dispatcher.service';

import { NotificationService } from '../../notification/services/notification.service';

import { DEFAULT_LOW_BALANCE_THRESHOLD } from '../entities/provider.constants';

import { ProviderBalanceRepository } from '../repositories/provider-balance.repository';

import { ProviderRegistryService } from './provider-registry.service';

import { ProviderRepository } from '../repositories/provider.repository';



@Injectable()

export class ProviderHealthService {

  private readonly logger = new Logger(ProviderHealthService.name);



  constructor(

    private readonly registry: ProviderRegistryService,

    private readonly providerRepository: ProviderRepository,

    private readonly balanceRepository: ProviderBalanceRepository,

    private readonly configService: ConfigService,

    private readonly notificationService: NotificationService,

    private readonly activityDispatcher: ActivityEventDispatcher,

  ) {}



  async syncProviderBalance(providerId: string): Promise<{

    balance: number;

    lastCheckedAt: Date;

    lowBalance: boolean;

    status: ProviderBalanceStatus;

  }> {

    const provider = await this.providerRepository.findProviderById(providerId);

    if (!provider) {

      throw new Error(`Provider not found: ${providerId}`);

    }



    const balanceRow = await this.balanceRepository.ensureForProvider(providerId);

    const threshold = Number(balanceRow.lowBalanceThreshold);



    try {

      const adapter = this.registry.getAdapter(provider.code);

      const result = await adapter.getBalance();

      const syncedAt = new Date();

      const lowBalance = result.balance < threshold;

      const status = lowBalance

        ? ProviderBalanceStatus.LOW_BALANCE

        : ProviderBalanceStatus.NORMAL;



      await this.providerRepository.updateBalance(

        providerId,

        new Decimal(result.balance),

        syncedAt,

      );



      await this.balanceRepository.updateSyncResult({

        providerId,

        balance: new Decimal(result.balance),

        status,

        lastSyncAt: syncedAt,

        lastErrorMessage: null,

        lastErrorAt: null,

      });



      if (lowBalance) {
        this.activityDispatcher.dispatch({
          eventType: SystemActivityEventType.LOW_PROVIDER_BALANCE,
          eventCategory: SystemActivityEventCategory.PROVIDER,
          severity: SystemActivitySeverity.WARNING,
          source: SystemActivitySource.SYSTEM,
          resource: 'provider',
          resourceId: providerId,
          resourceDisplay: provider.code,
          title: `Low Provider Balance: ${provider.code}`,
          description: `Balance ${result.balance} below threshold ${threshold}`,
          metadata: { providerId, balance: result.balance, threshold },
        });

        await this.notificationService.notifyProviderLowBalance(
          providerId,
          provider.code,
          provider.name,
          result.balance,
          threshold,
          {
            admin: balanceRow.alertAdminEnabled,
            telegram: balanceRow.alertTelegramEnabled,
            email: balanceRow.alertEmailEnabled,
          },
        );

        this.logger.warn(

          `Provider ${provider.code} low balance=${result.balance} threshold=${threshold}`,

        );

      }



      return {

        balance: result.balance,

        lastCheckedAt: syncedAt,

        lowBalance,

        status,

      };

    } catch (error) {

      const syncedAt = new Date();

      const message = error instanceof Error ? error.message : String(error);



      await this.balanceRepository.updateSyncResult({
        providerId,
        balance: balanceRow.balance,
        status: ProviderBalanceStatus.ERROR,
        lastSyncAt: syncedAt,
        lastErrorMessage: message,
        lastErrorAt: syncedAt,
      });

      await this.notificationService.notifyProviderError(
        providerId,
        provider.code,
        provider.name,
        message,
        {
          admin: balanceRow.alertAdminEnabled,
          telegram: balanceRow.alertTelegramEnabled,
          email: balanceRow.alertEmailEnabled,
        },
      );

      this.logger.error(`Provider ${provider.code} balance sync error: ${message}`);

      throw error;

    }

  }



  resolveLowBalanceThreshold(providerId: string): Promise<number> {

    return this.balanceRepository

      .ensureForProvider(providerId)

      .then((row) => Number(row.lowBalanceThreshold));

  }



  getDefaultThreshold(): number {

    return (

      this.configService.get<number>('provider.lowBalanceThreshold') ??

      DEFAULT_LOW_BALANCE_THRESHOLD

    );

  }

}


