import { Injectable } from '@nestjs/common';
import { ReconcileDomain } from '@prisma/client';
import { PaymentReconcileDto } from '../dto/finance.dto';
import {
  comparePaymentReconciliation,
  summarizeReconcileItems,
} from '../entities/reconcile.engine';
import { FinanceRepository } from '../repositories/finance.repository';
import { FinanceAuditService } from './finance-audit.service';

@Injectable()
export class PaymentReconcileService {
  constructor(
    private readonly repository: FinanceRepository,
    private readonly financeAudit: FinanceAuditService,
  ) {}

  async reconcile(adminId: string, dto: PaymentReconcileDto) {
    const payments = await this.repository.findPaymentsForReconcile(
      dto.gateway,
      dto.reportDate,
    );
    const internalLines = this.repository.mapPaymentsToInternalLines(payments);
    const items = comparePaymentReconciliation(dto.transactions, internalLines);
    const summary = summarizeReconcileItems(items);

    const report = await this.repository.createReconcileReport({
      domain: ReconcileDomain.PAYMENT,
      gatewayOrProvider: dto.gateway,
      reportDate: new Date(dto.reportDate),
      totalMatched: summary.matched,
      totalMismatch: summary.mismatch,
      summary: {
        type: 'PAYMENT',
        gateway: dto.gateway,
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
      domain: ReconcileDomain.PAYMENT,
      gateway: dto.gateway,
      reportDate: dto.reportDate,
      ...summary,
    });

    return {
      reportId: report.id,
      domain: ReconcileDomain.PAYMENT,
      gateway: dto.gateway,
      reportDate: dto.reportDate,
      summary,
      items,
    };
  }
}
