import { Injectable } from '@nestjs/common';
import { ProviderTransactionStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { FinanceRepository } from '../repositories/finance.repository';
import { ProviderOperationsRepository } from '../repositories/provider-operations.repository';
import { ProviderDailyReconciliationService } from './provider-daily-reconciliation.service';
import {
  ProviderFinanceDashboardQueryDto,
  ProviderReconciliationQueryDto,
  ProviderTransactionSearchQueryDto,
} from '../dto/finance.dto';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';

@Injectable()
export class ProviderOperationsService {
  constructor(
    private readonly operationsRepository: ProviderOperationsRepository,
    private readonly financeRepository: FinanceRepository,
    private readonly dailyReconciliation: ProviderDailyReconciliationService,
  ) {}

  listReconciliationReports(query: ProviderReconciliationQueryDto) {
    const range =
      query.dateFrom && query.dateTo
        ? assertFinanceDateRange(query.dateFrom, query.dateTo)
        : null;

    return this.operationsRepository.listReconciliationReports({
      providerId: query.providerId,
      dateFrom: range?.from,
      dateTo: range?.to,
      skip: query.skip,
      take: query.take ?? 50,
    });
  }

  async runDailyReconciliation(providerId?: string, reportDate?: string) {
    const date = reportDate ? new Date(reportDate) : new Date();
    if (providerId) {
      return this.dailyReconciliation.reconcileProviderDay(providerId, date);
    }
    await this.dailyReconciliation.runForAllProviders(date);
    return { ok: true, reportDate: date.toISOString().slice(0, 10) };
  }

  async searchTransactions(query: ProviderTransactionSearchQueryDto) {
    const range =
      query.dateFrom && query.dateTo
        ? assertFinanceDateRange(query.dateFrom, query.dateTo)
        : null;

    const filter = {
      providerId: query.providerId,
      dateFrom: range?.from,
      dateTo: range?.to,
      status: query.status as ProviderTransactionStatus | undefined,
      orderId: query.orderId,
      providerTransactionId: query.providerTransactionId,
      skip: query.skip,
      take: query.take ?? 50,
    };

    const [items, total] = await Promise.all([
      this.operationsRepository.searchTransactions(filter),
      this.operationsRepository.countTransactions(filter),
    ]);

    return {
      items: items.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderCode: row.order.orderCode,
        providerId: row.providerId,
        providerCode: row.provider.code,
        providerName: row.provider.name,
        providerTransactionId: row.providerTransactionId,
        requestId: row.requestId,
        status: row.status,
        type: row.type,
        faceValue: row.faceValue?.toString() ?? null,
        providerCost: row.providerCost?.toString() ?? null,
        customerPaid: row.order.totalAmount.toString(),
        gatewayFee: row.order.paymentFeeAmount?.toString() ?? '0',
        profit: row.order.profit?.toString() ?? null,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        responsePayload: row.responsePayload,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      })),
      total,
    };
  }

  async getFinanceDashboard(query: ProviderFinanceDashboardQueryDto) {
    const range = assertFinanceDateRange(
      query.dateFrom ?? new Date().toISOString().slice(0, 10),
      query.dateTo ?? new Date().toISOString().slice(0, 10),
    );

    const todayProfit = await this.financeRepository.calculateProfit({
      dateFrom: range.from,
      dateTo: range.to,
      providerId: query.providerId,
    });

    const providers = query.providerId
      ? [{ id: query.providerId }]
      : await this.financeRepository.listProviderIds();

    const byProvider = await Promise.all(
      providers.map(async (p) => {
        const summary = await this.operationsRepository.providerFinanceSummary(
          p.id,
          range.from,
          range.to,
        );
        let orders = 0;
        let success = 0;
        let cost = new Decimal(0);
        for (const row of summary) {
          orders += row._count._all;
          if (row.status === ProviderTransactionStatus.SUCCESS) {
            success += row._count._all;
            cost = cost.add(row._sum.providerCost ?? 0);
          }
        }
        const provider = await this.financeRepository.findProviderSummary(p.id);
        const profitGenerated = await this.operationsRepository.sumProviderProfit(
          p.id,
          range.from,
          range.to,
        );
        return {
          providerId: p.id,
          code: provider?.code ?? p.id,
          name: provider?.name ?? '',
          orders,
          success,
          successRate: orders > 0 ? Math.round((success / orders) * 1000) / 10 : null,
          totalCost: cost.toFixed(2),
          profitGenerated: profitGenerated.toFixed(2),
        };
      }),
    );

    return {
      dateFrom: range.from.toISOString(),
      dateTo: range.to.toISOString(),
      today: {
        revenue: todayProfit.revenue,
        providerCost: todayProfit.providerCost,
        gatewayFee: await this.financeRepository.sumGatewayFees(range.from, range.to),
        grossProfit: todayProfit.grossProfit,
        orderCount: todayProfit.orderCount,
      },
      byProvider,
    };
  }
}
