import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ProviderReconciliationStatus,
  ProviderTransactionStatus,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ProviderRegistryService } from '../../provider/services/provider-registry.service';
import { ProviderRepository } from '../../provider/repositories/provider.repository';
import { ProviderBalanceRepository } from '../../provider/repositories/provider-balance.repository';
import { ProviderOperationsRepository } from '../repositories/provider-operations.repository';

const DAILY_RECON_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfUtcDay(date: Date): Date {
  const start = startOfUtcDay(date);
  return new Date(start.getTime() + DAILY_RECON_MS);
}

@Injectable()
export class ProviderDailyReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProviderDailyReconciliationService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly providerRepository: ProviderRepository,
    private readonly balanceRepository: ProviderBalanceRepository,
    private readonly registry: ProviderRegistryService,
    private readonly operationsRepository: ProviderOperationsRepository,
  ) {}

  onModuleInit(): void {
    void this.runForAllProviders(new Date());
    this.timer = setInterval(
      () => void this.runForAllProviders(new Date()),
      DAILY_RECON_MS,
    );
    this.logger.log('Provider daily reconciliation cron started');
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runForAllProviders(reportDate: Date) {
    const providers = await this.providerRepository.listActiveProviders();
    for (const provider of providers) {
      try {
        await this.reconcileProviderDay(provider.id, reportDate);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Daily reconcile failed provider=${provider.code}: ${message}`);
      }
    }
  }

  async reconcileProviderDay(providerId: string, reportDate: Date) {
    const day = startOfUtcDay(reportDate);
    const dayEnd = endOfUtcDay(reportDate);

    const previous = await this.operationsRepository.findPreviousClosingBalance(
      providerId,
      day,
    );
    const balanceRow = await this.balanceRepository.findByProviderId(providerId);
    const openingBalance =
      previous?.closingBalance ??
      balanceRow?.balance ??
      new Decimal(0);

    const groups = await this.operationsRepository.aggregateDayTransactions(
      providerId,
      day,
      dayEnd,
    );

    let totalTransactions = 0;
    let successTransactions = 0;
    let failedTransactions = 0;
    let totalProviderCost = new Decimal(0);

    for (const group of groups) {
      const count = group._count._all;
      totalTransactions += count;
      if (group.status === ProviderTransactionStatus.SUCCESS) {
        successTransactions += count;
        totalProviderCost = totalProviderCost.add(group._sum.providerCost ?? 0);
      } else if (
        group.status === ProviderTransactionStatus.FAILED ||
        group.status === ProviderTransactionStatus.TIMEOUT
      ) {
        failedTransactions += count;
      }
    }

    const expectedBalance = openingBalance.sub(totalProviderCost);

    let actualBalance: Decimal | null = null;
    try {
      const provider = await this.providerRepository.findProviderById(providerId);
      if (provider) {
        const adapter = this.registry.getAdapter(provider.code);
        const live = await adapter.getBalance();
        actualBalance = new Decimal(live.balance);
      }
    } catch {
      actualBalance = balanceRow?.balance ?? null;
    }

    const differenceAmount = actualBalance
      ? actualBalance.sub(expectedBalance)
      : new Decimal(0);

    const status = ProviderOperationsRepository.resolveReconciliationStatus(
      differenceAmount,
      actualBalance !== null,
    );

    return this.operationsRepository.upsertReconciliationReport({
      providerId,
      reportDate: day,
      openingBalance,
      closingBalance: actualBalance,
      totalTransactions,
      successTransactions,
      failedTransactions,
      totalProviderCost,
      expectedBalance,
      actualBalance,
      differenceAmount,
      status,
    });
  }
}
