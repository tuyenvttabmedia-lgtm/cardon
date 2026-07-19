import { Injectable } from '@nestjs/common';
import { GatewayFeesQueryDto } from '../dto/finance.dto';
import { assertFinanceDateRange } from '../utils/finance-date-range.util';
import { FinanceRepository } from '../repositories/finance.repository';

@Injectable()
export class GatewayFeesService {
  constructor(private readonly repository: FinanceRepository) {}

  report(query: GatewayFeesQueryDto) {
    const range = assertFinanceDateRange(query.dateFrom, query.dateTo);
    return this.repository.calculateGatewayFees({
      dateFrom: range.from,
      dateTo: range.to,
      gateway: query.gateway,
    });
  }
}
