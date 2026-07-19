import { BadRequestException } from '@nestjs/common';
import { FINANCE_MAX_DATE_RANGE_DAYS } from '../entities/finance.constants';

export function assertFinanceDateRange(dateFrom: string, dateTo: string): {
  from: Date;
  to: Date;
} {
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new BadRequestException('Invalid date range');
  }

  if (to < from) {
    throw new BadRequestException('dateTo must be on or after dateFrom');
  }

  const maxMs = FINANCE_MAX_DATE_RANGE_DAYS * 24 * 60 * 60 * 1000;
  if (to.getTime() - from.getTime() > maxMs) {
    throw new BadRequestException(
      `Date range cannot exceed ${FINANCE_MAX_DATE_RANGE_DAYS} days`,
    );
  }

  return { from, to };
}
