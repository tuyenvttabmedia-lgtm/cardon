import { Injectable } from '@nestjs/common';
import { ProfitQueryDto } from '../dto/finance.dto';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';
import { FinanceRepository } from '../repositories/finance.repository';

@Injectable()
export class ProfitService {
  constructor(private readonly repository: FinanceRepository) {}

  calculate(query: ProfitQueryDto) {
    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);
    return this.repository.calculateProfit({
      dateFrom: range.from,
      dateTo: range.to,
      productId: query.productId,
      providerId: query.providerId,
    });
  }
}
