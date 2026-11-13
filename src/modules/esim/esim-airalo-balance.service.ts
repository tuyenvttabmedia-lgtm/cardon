import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ProviderBalanceStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ProviderBalanceRepository } from '../provider/repositories/provider-balance.repository';
import { ProviderRepository } from '../provider/repositories/provider.repository';
import { EsimAiraloAdapter } from './esim-airalo.adapter';
import { ESIM_AIRALO_PROVIDER_CODE } from './esim.constants';

/** USD credit threshold before low-balance alerts (Airalo wallet, not VND). */
export const AIRALO_LOW_BALANCE_USD = 100;

export interface AiraloBalanceSyncResult {
  balance: number;
  currency: string;
  name: string;
  lastCheckedAt: string;
  lowBalance: boolean;
  status: ProviderBalanceStatus;
}

@Injectable()
export class EsimAiraloBalanceService {
  private readonly logger = new Logger(EsimAiraloBalanceService.name);

  constructor(
    private readonly airalo: EsimAiraloAdapter,
    private readonly providerRepository: ProviderRepository,
    private readonly balanceRepository: ProviderBalanceRepository,
  ) {}

  async syncBalance(): Promise<AiraloBalanceSyncResult> {
    const provider = await this.providerRepository.ensureAiraloProvider();
    const balanceRow = await this.balanceRepository.ensureForProvider(
      provider.id,
      AIRALO_LOW_BALANCE_USD,
    );
    // Migrate rows created with the default VND threshold (5_000_000).
    if (Number(balanceRow.lowBalanceThreshold) >= 1_000_000) {
      await this.balanceRepository.updateAlertSettings({
        providerId: provider.id,
        lowBalanceThreshold: new Decimal(AIRALO_LOW_BALANCE_USD),
      });
      balanceRow.lowBalanceThreshold = new Decimal(AIRALO_LOW_BALANCE_USD);
    }

    try {
      const wallet = await this.airalo.getBalance();
      const syncedAt = new Date();
      const threshold = Number(balanceRow.lowBalanceThreshold);
      const lowBalance = wallet.amount < threshold;
      const status = lowBalance
        ? ProviderBalanceStatus.LOW_BALANCE
        : ProviderBalanceStatus.NORMAL;

      await this.providerRepository.updateBalance(
        provider.id,
        new Decimal(wallet.amount),
        syncedAt,
      );
      await this.balanceRepository.updateSyncResult({
        providerId: provider.id,
        balance: new Decimal(wallet.amount),
        status,
        lastSyncAt: syncedAt,
        lastErrorMessage: null,
        lastErrorAt: null,
      });

      if (lowBalance) {
        this.logger.warn(
          `Airalo low balance=${wallet.amount} ${wallet.currency} threshold=${threshold}`,
        );
      }

      return {
        balance: wallet.amount,
        currency: wallet.currency,
        name: wallet.name,
        lastCheckedAt: syncedAt.toISOString(),
        lowBalance,
        status,
      };
    } catch (error) {
      const syncedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      await this.balanceRepository.updateSyncResult({
        providerId: provider.id,
        balance: balanceRow.balance,
        status: ProviderBalanceStatus.ERROR,
        lastSyncAt: syncedAt,
        lastErrorMessage: message,
        lastErrorAt: syncedAt,
      });
      this.logger.error(`Airalo balance sync error: ${message}`);
      throw error instanceof BadRequestException
        ? error
        : new BadRequestException(message);
    }
  }

  async readCachedBalance(): Promise<{
    balance: number | null;
    currency: string;
    lastCheckedAt: string | null;
  }> {
    const provider = await this.providerRepository.findProviderByCode(
      ESIM_AIRALO_PROVIDER_CODE,
    );
    if (!provider) {
      return { balance: null, currency: 'USD', lastCheckedAt: null };
    }
    return {
      balance: provider.balance != null ? Number(provider.balance) : null,
      currency: 'USD',
      lastCheckedAt: provider.lastBalanceSyncedAt?.toISOString() ?? null,
    };
  }
}
