import { BadRequestException } from '@nestjs/common';
import { FINANCE_MAX_DATE_RANGE_DAYS } from '../entities/finance.constants';
import {
  vietnamDayBounds,
  vietnamDayEndInclusive,
} from '../../../common/utils/vietnam-time.util';

export function assertFinanceDateRange(dateFrom: string, dateTo: string): {
  from: Date;
  to: Date;
} {
  let from: Date;
  let to: Date;
  try {
    from = vietnamDayBounds(dateFrom).start;
    to = vietnamDayEndInclusive(dateTo);
  } catch {
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

/**
 * Inclusive Vietnam calendar days. `toExclusive` is 00:00 ICT on the day after `dateTo`.
 * Date-only strings are not UTC midnights: 2026-10-06 must include 6 Oct ICT and exclude 7 Oct 00:46 ICT.
 */
export function vietnamCalendarRange(dateFrom: string, dateTo: string): {
  from: Date;
  toExclusive: Date;
} {
  assertFinanceDateRange(dateFrom, dateTo);
  const from = vietnamDayBounds(dateFrom).start;
  const toExclusive = vietnamDayBounds(dateTo).endExclusive;
  if (toExclusive <= from) {
    throw new BadRequestException('Invalid date range');
  }
  return { from, toExclusive };
}
