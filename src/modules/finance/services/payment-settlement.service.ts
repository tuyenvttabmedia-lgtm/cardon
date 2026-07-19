import { Injectable } from '@nestjs/common';
import { PaymentSettlementQueryDto } from '../dto/finance.dto';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';
import { FinanceRepository } from '../repositories/finance.repository';

@Injectable()
export class PaymentSettlementService {
  constructor(private readonly repository: FinanceRepository) {}

  report(query: PaymentSettlementQueryDto) {
    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);
    return this.repository.calculatePaymentSettlement({
      dateFrom: range.from,
      dateTo: range.to,
      gateway: query.gateway,
      settlementType: query.settlementType,
    });
  }
}
