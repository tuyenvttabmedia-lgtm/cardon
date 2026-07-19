import { Injectable, NotFoundException } from '@nestjs/common';
import { FinanceListQueryDto } from '../dto/finance.dto';
import { FinanceRepository } from '../repositories/finance.repository';

@Injectable()
export class ReconcileReportService {
  constructor(private readonly repository: FinanceRepository) {}

  listReports(query: FinanceListQueryDto) {
    return this.repository.listReconcileReports(query.skip, query.take);
  }

  async getReport(reportId: string) {
    const report = await this.repository.findReconcileReportById(reportId);
    if (!report) {
      throw new NotFoundException('Reconcile report not found');
    }
    return report;
  }
}
