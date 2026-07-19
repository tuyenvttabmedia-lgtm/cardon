import { Injectable, NotFoundException } from '@nestjs/common';
import { ReconcileDomain } from '@prisma/client';
import { ProviderReconcileDto } from '../dto/finance.dto';
import {
  compareProviderReconciliation,
  summarizeReconcileItems,
} from '../entities/reconcile.engine';
import { FinanceRepository } from '../repositories/finance.repository';
import { FinanceAuditService } from './finance-audit.service';

@Injectable()
export class ProviderReconcileService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly financeAudit: FinanceAuditService,
  ) {}

  async reconcile(adminId: string, dto: ProviderReconcileDto) {
    const provider = await this.repository.findProviderByCode(dto.providerCode);
    if (!provider) {
      throw new NotFoundException(`Provider ${dto.providerCode} not found`);
    }

    const internalLines = await this.repository.findProviderTransactionsForReconcile(
      provider.id,
      dto.reportDate,
    );
    const items = compareProviderReconciliation(dto.transactions, internalLines);
    const summary = summarizeReconcileItems(items);

    const report = await this.repository.createReconcileReport({
      domain: ReconcileDomain.PROVIDER,
      gatewayOrProvider: provider.code,
      reportDate: new Date(dto.reportDate),
      totalMatched: summary.matched,
      totalMismatch: summary.mismatch,
      summary: {
        type: 'PROVIDER',
        providerCode: provider.code,
        ...summary,
      },
      items: items.map((item) => ({
        matchStatus: item.matchStatus,
        reference: item.reference,
        localAmount: item.localAmount,
        externalAmount: item.externalAmount,
      })),
    });

    await this.financeAudit.recordReconcileCreated(adminId, report.id, {
      domain: ReconcileDomain.PROVIDER,
      providerCode: provider.code,
      reportDate: dto.reportDate,
      ...summary,
    });

    return {
      reportId: report.id,
      domain: ReconcileDomain.PROVIDER,
      providerCode: provider.code,
      reportDate: dto.reportDate,
      summary,
      items,
    };
  }
}
