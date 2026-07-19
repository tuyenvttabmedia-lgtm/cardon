import { Injectable } from '@nestjs/common';
import { AgentStatementQueryDto, GatewayFeesQueryDto, ProfitQueryDto, ProviderTransactionSearchQueryDto } from '../dto/finance.dto';
import { assertExportCsvSafe, sanitizeExportField } from '../entities/export-safety';
import { extractGatewayTransactionId } from '../entities/reconcile.engine';
import { FinanceRepository } from '../repositories/finance.repository';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';
import { AgentStatementService } from './agent-statement.service';
import { ProfitService } from './profit.service';
import { ReconcileReportService } from './reconcile-report.service';
import { ProviderOperationsService } from './provider-operations.service';

@Injectable()
export class ExportService {
  constructor(
    private readonly reconcileReportService: ReconcileReportService,
    private readonly profitService: ProfitService,
    private readonly agentStatementService: AgentStatementService,
    private readonly financeRepository: FinanceRepository,
    private readonly providerOperationsService: ProviderOperationsService,
  ) {}
  async exportReconciliationCsv(reportId: string): Promise<string> {
    const report = await this.reconcileReportService.getReport(reportId);
    const header = 'reference,match_status,local_amount,external_amount,resolution';
    const rows = report.items.map(
      (item) =>
        `${escapeCsv(item.reference)},${item.matchStatus},${item.localAmount?.toFixed(2) ?? ''},${item.externalAmount?.toFixed(2) ?? ''},${item.resolution}`,
    );
    const csv = [header, ...rows].join('\n');
    assertExportCsvSafe(csv);
    return csv;
  }

  async exportProfitCsv(query: ProfitQueryDto): Promise<string> {
    const profit = await this.profitService.calculate(query);
    const header = 'metric,value';
    const rows = [
      `date_from,${profit.dateFrom}`,
      `date_to,${profit.dateTo}`,
      `order_count,${profit.orderCount}`,
      `revenue,${profit.revenue}`,
      `provider_cost,${profit.providerCost}`,
      `gross_profit,${profit.grossProfit}`,
      `currency,${profit.currency}`,
    ];
    const csv = [header, ...rows].join('\n');
    assertExportCsvSafe(csv);
    return csv;
  }

  async exportAgentStatementCsv(
    agentId: string,
    query: AgentStatementQueryDto,
  ): Promise<string> {
    const statement = await this.agentStatementService.generate(agentId, query);
    const header =
      'id,type,amount,before_balance,after_balance,before_held,after_held,reference_type,reference_id,description,created_at';
    const rows = statement.entries.map(
      (entry) =>
        `${entry.id},${entry.type},${entry.amount},${entry.beforeBalance},${entry.afterBalance},${entry.beforeHeld},${entry.afterHeld},${entry.referenceType},${entry.referenceId},${escapeCsv(sanitizeExportField(entry.description))},${entry.createdAt}`,
    );

    const summary = [
      `# opening_balance,${statement.openingBalance.balance}`,
      `# closing_balance,${statement.closingBalance.balance}`,
      `# credits,${statement.summary.credits}`,
      `# debits,${statement.summary.debits}`,
      `# holds,${statement.summary.holds}`,
    ];

    const csv = [...summary, header, ...rows].join('\n');
    assertExportCsvSafe(csv);
    return csv;
  }

  async exportPaymentsReconciliationCsv(query: GatewayFeesQueryDto): Promise<string> {
    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);
    const payments = await this.financeRepository.findPaymentsForAccountingExport({
      dateFrom: range.from,
      dateTo: range.to,
      gateway: query.gateway,
    });

    const header =
      'gateway,method,amount,fee,bank_ref,settlement_date,reconciliation_status';
    const rows = payments.map((payment) => {
      const method =
        payment.methodCode ??
        payment.order.methodDisplayName ??
        payment.order.paymentMethodCode ??
        '';
      const gatewayRef =
        payment.gatewayTransactionId ??
        extractGatewayTransactionId(payment.gatewayResponse) ??
        '';
      const bankRef = payment.bankReference ?? payment.bankTransactionId ?? '';
      const settlementDate = payment.settlementDate?.toISOString().slice(0, 10) ?? '';
      return [
        payment.gateway,
        escapeCsv(method),
        payment.amount.toFixed(2),
        payment.order.paymentFeeAmount.toFixed(2),
        escapeCsv(bankRef),
        settlementDate,
        payment.reconciliationStatus,
      ].join(',');
    });

    const csv = [header, ...rows].join('\n');
    assertExportCsvSafe(csv);
    return csv;
  }

  async exportProviderTransactionsCsv(
    query: ProviderTransactionSearchQueryDto,
  ): Promise<string> {
    const result = await this.providerOperationsService.searchTransactions({
      ...query,
      take: 5000,
    });
    const header =
      'order_code,provider,status,provider_transaction_id,customer_paid,provider_cost,profit,error,created_at';
    const rows = result.items.map((row) =>
      [
        escapeCsv(row.orderCode),
        escapeCsv(row.providerCode),
        row.status,
        row.providerTransactionId ?? '',
        row.customerPaid,
        row.providerCost ?? '',
        row.profit ?? '',
        escapeCsv(row.errorMessage ?? ''),
        row.createdAt,
      ].join(','),
    );
    const csv = [header, ...rows].join('\n');
    assertExportCsvSafe(csv);
    return csv;
  }
}

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
